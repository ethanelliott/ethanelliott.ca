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
import { readingToMeasurements } from './measurement-types';

const DEFAULT_SCAN_INTERVAL_SECONDS = 30;

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
    const devices = await this._devices.listEnabled();
    if (devices.length === 0) return;

    const byMac = new Map(devices.map((d) => [d.macAddress, d]));
    const targets: AranetTarget[] = devices.map((d) => ({
      mac: d.macAddress,
      type: d.type as AranetDeviceType,
    }));

    const scanned = await this._scanner.poll(targets);
    const now = new Date();

    for (const result of scanned) {
      const device = byMac.get(result.deviceId);
      if (!device) continue;

      this._logRawOnce(result);
      await this._devices.markSeen(device.id, now);

      if (this._isNewReading(result.deviceId, result.reading.age)) {
        await this._store(device, result);
      }
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

  // ── private helpers ──────────────────────────────────────────────

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
