import { inject } from '@ee/di';
import { Database } from '../data-source';
import { DeviceEntity } from './device.entity';
import { ReadingEntity } from './reading.entity';
import { MeasurementEntity } from './measurement.entity';
import { DeviceService } from './device.service';
import {
  AranetScanner,
  AranetTarget,
  DiscoveredDevice,
  ScannedReading,
} from './aranet.scanner';
import { AranetDeviceType } from './aranet.parser';
import {
  MEASUREMENT_UNITS,
  MeasurementType,
  readingToMeasurements,
} from './measurement-types';
import * as metrics from './metrics';

const DEFAULT_SCAN_INTERVAL_SECONDS = 30;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 7;
const DEFAULT_ROW_CAP = 10_000;
const MAX_ROW_CAP = 50_000;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export interface HistoryQuery {
  /** Exclusive upper bound; defaults to now. */
  before?: Date;
  /** Window size in hours back from `before`; default 24, capped at 7 days. */
  hours?: number;
  /** Safety cap on rows returned. */
  limit?: number;
}

export interface PageWindow {
  from: string;
  to: string;
  /** Pass as `before` to fetch the next (older) page. */
  nextBefore: string;
  hasMore: boolean;
  count: number;
  /** True when the row cap was hit — narrow the window for the full set. */
  capped: boolean;
}

export interface HistoryPage extends PageWindow {
  deviceId: string;
  readings: ReadingEntity[];
}

export interface SeriesPage extends PageWindow {
  deviceId: string;
  type: MeasurementType;
  unit: string;
  points: Array<{ t: string; v: number }>;
}

export class AranetService {
  private readonly _db = inject(Database);
  private readonly _devices = inject(DeviceService);
  private readonly _readingRepo = this._db.repositoryFor(ReadingEntity);
  private readonly _measurementRepo =
    this._db.repositoryFor(MeasurementEntity);
  private readonly _scanner = new AranetScanner();

  private _timer: ReturnType<typeof setInterval> | null = null;
  /** Last advertisement `age` seen per device mac, to detect a fresh reading. */
  private readonly _lastAge = new Map<string, number>();
  /** Devices we've already logged raw bytes for (one-time verification). */
  private readonly _loggedRaw = new Set<string>();
  /** Latest decoded advertisement per mac, for republishing Prometheus gauges. */
  private readonly _latest = new Map<
    string,
    { result: ScannedReading; at: Date }
  >();

  private get _intervalMs(): number {
    const s = Number(process.env.SCAN_INTERVAL_SECONDS);
    return (
      (Number.isFinite(s) && s > 0 ? s : DEFAULT_SCAN_INTERVAL_SECONDS) * 1000
    );
  }

  async start(): Promise<void> {
    // Ensure TypeORM has finished initializing before any query runs.
    await this._db.ready;
    await this._devices.seedFromEnv();
    await this._scanner.init();
    await this.poll();
    this._timer = setInterval(() => {
      this.poll().catch((err) => console.error('❌ Scan cycle failed:', err));
    }, this._intervalMs);
  }

  async stop(): Promise<void> {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    await this._scanner.stop();
    console.log('🛑 Aranet scanner stopped');
  }

  /** One scan cycle: read each enabled device's advert and persist new readings. */
  async poll(): Promise<void> {
    try {
      const devices = await this._devices.listEnabled();
      const byMac = new Map(devices.map((d) => [d.macAddress, d]));
      const targets: AranetTarget[] = devices.map((d) => ({
        mac: d.macAddress,
        type: d.type as AranetDeviceType,
      }));

      const scanned = devices.length
        ? await this._scanner.poll(targets)
        : [];
      const now = new Date();
      const freshMacs = new Set<string>();

      for (const result of scanned) {
        const device = byMac.get(result.deviceId);
        if (!device) continue;

        freshMacs.add(result.deviceId);
        this._latest.set(result.deviceId, { result, at: now });
        this._logRawOnce(result);
        await this._devices.markSeen(device.id, now);

        if (this._isNewReading(result.deviceId, result.reading.age)) {
          await this._store(device, result);
        }
      }

      this._publishMetrics(devices, freshMacs);
      metrics.scanCyclesTotal.inc();
    } catch (err) {
      metrics.scanErrorsTotal.inc();
      throw err;
    }
  }

  /** Mirror the latest per-device readings and scan health onto Prometheus. */
  private _publishMetrics(
    devices: DeviceEntity[],
    freshMacs: Set<string>
  ): void {
    // Reset+repopulate so a device removed via the API drops its series.
    metrics.resetPerDeviceGauges();
    metrics.scannerUp.set(1);
    metrics.devicesTotal.set(devices.length);
    metrics.lastScanTimestamp.set(Math.floor(Date.now() / 1000));

    const managed = new Set(devices.map((d) => d.macAddress));
    for (const mac of this._latest.keys()) {
      if (!managed.has(mac)) this._latest.delete(mac);
    }

    for (const device of devices) {
      const labels = {
        device: device.name,
        mac: device.macAddress,
        type: device.type,
      };
      metrics.deviceInfo.set(labels, 1);
      metrics.deviceUp.set(labels, freshMacs.has(device.macAddress) ? 1 : 0);

      const latest = this._latest.get(device.macAddress);
      if (!latest) continue;
      const { reading } = latest.result;

      if (reading.co2 != null) metrics.co2Ppm.set(labels, reading.co2);
      if (reading.radon != null) metrics.radonBqM3.set(labels, reading.radon);
      metrics.temperatureCelsius.set(labels, reading.temperature);
      metrics.humidityPercent.set(labels, reading.humidity);
      metrics.pressureHpa.set(labels, reading.pressure);
      metrics.batteryPercent.set(labels, reading.battery);
      metrics.status.set(labels, reading.status);

      // `age` is seconds-since-measurement when we captured it; advance it so a
      // stale reading visibly ages between fresh reads.
      const elapsed = Math.max(0, (Date.now() - latest.at.getTime()) / 1000);
      metrics.readingAgeSeconds.set(labels, Math.round(reading.age + elapsed));
      metrics.lastReadingTimestamp.set(
        labels,
        Math.floor((latest.at.getTime() - reading.age * 1000) / 1000)
      );
    }
  }

  /**
   * Live discovery: the Aranet devices BlueZ currently sees, each annotated
   * with whether it's already a managed device.
   */
  async scan(): Promise<Array<DiscoveredDevice & { managed: boolean; deviceId: string | null }>> {
    const [found, devices] = await Promise.all([
      this._scanner.discoverAranet(),
      this._devices.list(),
    ]);
    const byMac = new Map(devices.map((d) => [d.macAddress, d]));
    return found.map((f) => {
      const existing = byMac.get(f.macAddress);
      return { ...f, managed: !!existing, deviceId: existing?.id ?? null };
    });
  }

  /** Latest reading (with measurements) per device. */
  async getLatest(): Promise<ReadingEntity[]> {
    const devices = await this._devices.list();
    const out: ReadingEntity[] = [];
    for (const device of devices) {
      const reading = await this._readingRepo.findOne({
        where: { device: { id: device.id } },
        order: { measuredAt: 'DESC' },
        relations: { device: true, measurements: true },
      });
      if (reading) out.push(reading);
    }
    return out;
  }

  /** Recent readings (with measurements) for one device. */
  async getReadings(deviceId: string, limit = 200): Promise<ReadingEntity[]> {
    return this._readingRepo.find({
      where: { device: { id: deviceId } },
      order: { measuredAt: 'DESC' },
      take: limit,
      relations: { measurements: true },
    });
  }

  /**
   * Time-windowed page of full readings (with measurements), newest first.
   * Each page covers (`before` - `hours`, `before`]; follow `nextBefore` to
   * walk older pages.
   */
  async getHistory(deviceId: string, query: HistoryQuery): Promise<HistoryPage> {
    const { from, to, limit } = this._resolveWindow(query);

    const readings = await this._readingRepo
      .createQueryBuilder('r')
      .innerJoin('r.device', 'd')
      .leftJoinAndSelect('r.measurements', 'm')
      .where('d.id = :deviceId', { deviceId })
      .andWhere('r.measuredAt > :from', { from })
      .andWhere('r.measuredAt <= :to', { to })
      .orderBy('r.measuredAt', 'DESC')
      .take(limit)
      .getMany();

    const page = await this._pageMeta(deviceId, from, to, readings.length, limit);
    return { deviceId, readings, ...page };
  }

  /**
   * Time-windowed page of a single measurement type as flat {t, v} points,
   * newest first — convenient for charting one metric.
   */
  async getSeries(
    deviceId: string,
    type: MeasurementType,
    query: HistoryQuery
  ): Promise<SeriesPage> {
    const { from, to, limit } = this._resolveWindow(query);

    const rows = await this._measurementRepo
      .createQueryBuilder('m')
      .innerJoin('m.reading', 'r')
      .innerJoin('r.device', 'd')
      .where('d.id = :deviceId', { deviceId })
      .andWhere('m.type = :type', { type })
      .andWhere('r.measuredAt > :from', { from })
      .andWhere('r.measuredAt <= :to', { to })
      .orderBy('r.measuredAt', 'DESC')
      .take(limit)
      .select(['r.measuredAt AS t', 'm.value AS v'])
      .getRawMany<{ t: Date; v: number }>();

    const points = rows.map((row) => ({
      t: new Date(row.t).toISOString(),
      v: Number(row.v),
    }));
    const page = await this._pageMeta(deviceId, from, to, points.length, limit);
    return { deviceId, type, unit: MEASUREMENT_UNITS[type], points, ...page };
  }

  // ── private helpers ──────────────────────────────────────────────

  /** Resolve a history query into a concrete [from, to) window + row cap. */
  private _resolveWindow(query: HistoryQuery): {
    from: Date;
    to: Date;
    limit: number;
  } {
    const to = query.before ?? new Date();
    const hours = clamp(query.hours ?? DEFAULT_WINDOW_HOURS, 1, MAX_WINDOW_HOURS);
    const from = new Date(to.getTime() - hours * 3_600_000);
    const limit = clamp(query.limit ?? DEFAULT_ROW_CAP, 1, MAX_ROW_CAP);
    return { from, to, limit };
  }

  /** Common pagination metadata: whether older data exists, next cursor, etc. */
  private async _pageMeta(
    deviceId: string,
    from: Date,
    to: Date,
    count: number,
    limit: number
  ): Promise<PageWindow> {
    const olderCount = await this._readingRepo
      .createQueryBuilder('r')
      .innerJoin('r.device', 'd')
      .where('d.id = :deviceId', { deviceId })
      .andWhere('r.measuredAt <= :from', { from })
      .getCount();

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      nextBefore: from.toISOString(),
      hasMore: olderCount > 0,
      count,
      capped: count >= limit,
    };
  }

  private _isNewReading(mac: string, age: number): boolean {
    const last = this._lastAge.get(mac);
    this._lastAge.set(mac, age);
    // First sighting, or the age counter reset → a fresh measurement cycle.
    return last === undefined || age < last;
  }

  private async _store(
    device: DeviceEntity,
    result: ScannedReading
  ): Promise<void> {
    const { reading } = result;
    const measuredAt = new Date(Date.now() - reading.age * 1000);

    const row = this._readingRepo.create({
      device,
      measuredAt,
      measurements: readingToMeasurements(reading).map((m) =>
        this._measurementRepo.create(m)
      ),
    });
    await this._readingRepo.save(row);

    const headline =
      reading.co2 != null
        ? `${reading.co2} ppm CO2`
        : `${reading.radon} Bq/m3 radon`;
    console.log(
      `💾 ${device.name}: ${headline}, ${reading.temperature}°C, ` +
        `${reading.humidity}% RH, ${reading.pressure} hPa, batt ${reading.battery}%`
    );
  }

  private _logRawOnce(result: ScannedReading): void {
    if (this._loggedRaw.has(result.deviceId)) return;
    this._loggedRaw.add(result.deviceId);
    console.log(
      `🔬 ${result.deviceName} (${result.deviceId}) raw mfg-data: ${result.rawHex}`
    );
  }
}
