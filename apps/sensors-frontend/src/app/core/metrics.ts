import { Device, MeasurementType, Reading } from './models';

export type Level = 'good' | 'ok' | 'bad' | 'none';

export interface MetricMeta {
  key: MeasurementType;
  label: string;
  short: string;
  unit: string;
  icon: string;
  decimals: number;
  /** Typical display floor/ceiling for gauges. */
  min: number;
  max: number;
  level: (value: number) => Level;
}

/** Two-sided comfort band helper. */
const band =
  (goodLo: number, goodHi: number, okLo: number, okHi: number) =>
  (v: number): Level =>
    v >= goodLo && v <= goodHi
      ? 'good'
      : v >= okLo && v <= okHi
        ? 'ok'
        : 'bad';

/** Upward (lower is better) helper. */
const rising =
  (goodMax: number, okMax: number) =>
  (v: number): Level =>
    v < goodMax ? 'good' : v < okMax ? 'ok' : 'bad';

export const METRICS: Record<MeasurementType, MetricMeta> = {
  co2: {
    key: 'co2',
    label: 'CO₂',
    short: 'CO₂',
    unit: 'ppm',
    icon: '🫁',
    decimals: 0,
    min: 400,
    max: 2000,
    level: rising(800, 1400),
  },
  radon: {
    key: 'radon',
    label: 'Radon',
    short: 'Rn',
    unit: 'Bq/m³',
    icon: '☢️',
    decimals: 0,
    min: 0,
    max: 600,
    level: rising(100, 300),
  },
  temperature: {
    key: 'temperature',
    label: 'Temperature',
    short: 'Temp',
    unit: '°C',
    icon: '🌡️',
    decimals: 1,
    min: 10,
    max: 32,
    level: band(19, 25, 16, 28),
  },
  humidity: {
    key: 'humidity',
    label: 'Humidity',
    short: 'RH',
    unit: '%',
    icon: '💧',
    decimals: 0,
    min: 0,
    max: 100,
    level: band(40, 60, 30, 70),
  },
  pressure: {
    key: 'pressure',
    label: 'Pressure',
    short: 'hPa',
    unit: 'hPa',
    icon: '🧭',
    decimals: 0,
    min: 950,
    max: 1050,
    level: () => 'none',
  },
  battery: {
    key: 'battery',
    label: 'Battery',
    short: 'Batt',
    unit: '%',
    icon: '🔋',
    decimals: 0,
    min: 0,
    max: 100,
    level: (v) => (v > 50 ? 'good' : v > 20 ? 'ok' : 'bad'),
  },
  status: {
    key: 'status',
    label: 'Status',
    short: 'Status',
    unit: '',
    icon: '●',
    decimals: 0,
    min: 1,
    max: 3,
    level: () => 'none',
  },
};

/** The metrics shown for a device, in display order, excluding the raw status. */
export const PRIMARY_METRIC: Record<Device['type'], MeasurementType> = {
  co2: 'co2',
  radon: 'radon',
};

export const SECONDARY_METRICS: MeasurementType[] = [
  'temperature',
  'humidity',
  'pressure',
  'battery',
];

/** Map a reading's measurements into a quick lookup. */
export function valuesOf(
  reading: Reading
): Partial<Record<MeasurementType, number>> {
  const out: Partial<Record<MeasurementType, number>> = {};
  for (const m of reading.measurements) out[m.type] = m.value;
  return out;
}

/** The device's own green/yellow/red status (1/2/3) as a Level. */
export function deviceLevel(reading: Reading): Level {
  const status = reading.measurements.find((m) => m.type === 'status')?.value;
  return status === 1
    ? 'good'
    : status === 2
      ? 'ok'
      : status === 3
        ? 'bad'
        : 'none';
}

/**
 * "Both" status model: combine the device's own status with our threshold
 * band for the primary metric and surface the worse of the two.
 */
export function overallLevel(reading: Reading): Level {
  const rank: Record<Level, number> = { none: 0, good: 1, ok: 2, bad: 3 };
  const dev = deviceLevel(reading);
  const primary = PRIMARY_METRIC[reading.device.type];
  const value = valuesOf(reading)[primary];
  const thr = value != null ? METRICS[primary].level(value) : 'none';
  return rank[dev] >= rank[thr] ? dev : thr;
}

export function levelColorVar(level: Level): string {
  switch (level) {
    case 'good':
      return 'var(--good)';
    case 'ok':
      return 'var(--ok)';
    case 'bad':
      return 'var(--bad)';
    default:
      return 'var(--text-dim)';
  }
}

export function levelLabel(level: Level): string {
  switch (level) {
    case 'good':
      return 'Good';
    case 'ok':
      return 'Fair';
    case 'bad':
      return 'Poor';
    default:
      return '—';
  }
}

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

/** Friendly device name; falls back to a type label when only a MAC is set. */
export function deviceName(device: Device): string {
  if (device.name && !MAC_RE.test(device.name)) return device.name;
  return device.type === 'co2' ? 'CO₂ Monitor' : 'Radon Monitor';
}

export function formatValue(type: MeasurementType, value: number): string {
  const d = METRICS[type].decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export interface MetricView {
  key: MeasurementType;
  meta: MetricMeta;
  value: number;
  display: string;
  level: Level;
  color: string;
}

export function metricView(type: MeasurementType, value: number): MetricView {
  const meta = METRICS[type];
  const level = meta.level(value);
  return {
    key: type,
    meta,
    value,
    display: formatValue(type, value),
    level,
    color: levelColorVar(level),
  };
}

export function primaryView(reading: Reading): MetricView | null {
  const key = PRIMARY_METRIC[reading.device.type];
  const value = valuesOf(reading)[key];
  return value == null ? null : metricView(key, value);
}

export function secondaryViews(reading: Reading): MetricView[] {
  const vals = valuesOf(reading);
  return SECONDARY_METRICS.filter((k) => vals[k] != null).map((k) =>
    metricView(k, vals[k] as number)
  );
}

/** Placeholder cards used to hint the future home-dashboard scope. */
export interface FutureModule {
  icon: string;
  title: string;
  note: string;
}

export const FUTURE_MODULES: FutureModule[] = [
  { icon: '⚡', title: 'Energy', note: 'Solar & usage' },
  { icon: '🏠', title: 'Home Assistant', note: 'Lights & climate' },
  { icon: '🖥️', title: 'Infrastructure', note: 'Cluster & network' },
];
