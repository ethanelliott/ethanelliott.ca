import { Counter, Gauge } from 'prom-client';

/**
 * Custom Aranet metrics on prom-client's default registry — the same registry
 * the shared @ee/starter plugin stack serves at `/metrics`, so no manual wiring
 * is needed beyond importing this module (see aranet.service.ts).
 *
 * Cardinality note: the per-device gauges are `.reset()` and fully repopulated
 * from the managed-device list on every publish, so a device removed via the
 * API drops out cleanly instead of leaving a stale series behind — there is
 * exactly one series per managed device.
 */

// ── Environment readings (one metric per physical quantity) ────────────────
// Labelled by device name + MAC + type so a single sensor is one series.

const readingLabels = ['device', 'mac', 'type'] as const;

export const co2Ppm = new Gauge({
  name: 'aranet_co2_ppm',
  help: 'CO2 concentration from the latest advertisement (ppm).',
  labelNames: readingLabels,
});

export const radonBqM3 = new Gauge({
  name: 'aranet_radon_bq_per_m3',
  help: 'Radon concentration from the latest advertisement (Bq/m3).',
  labelNames: readingLabels,
});

export const temperatureCelsius = new Gauge({
  name: 'aranet_temperature_celsius',
  help: 'Temperature from the latest advertisement (°C).',
  labelNames: readingLabels,
});

export const humidityPercent = new Gauge({
  name: 'aranet_humidity_percent',
  help: 'Relative humidity from the latest advertisement (%).',
  labelNames: readingLabels,
});

export const pressureHpa = new Gauge({
  name: 'aranet_pressure_hpa',
  help: 'Atmospheric pressure from the latest advertisement (hPa).',
  labelNames: readingLabels,
});

export const batteryPercent = new Gauge({
  name: 'aranet_battery_percent',
  help: 'Sensor battery level from the latest advertisement (%).',
  labelNames: readingLabels,
});

export const status = new Gauge({
  name: 'aranet_status',
  help: 'Aranet air-quality status: 1=green, 2=yellow, 3=red.',
  labelNames: readingLabels,
});

// ── Per-device freshness & identity ────────────────────────────────────────

export const deviceUp = new Gauge({
  name: 'aranet_device_up',
  help: '1 if a decodable advertisement was read for the device this cycle, else 0.',
  labelNames: readingLabels,
});

export const deviceInfo = new Gauge({
  name: 'aranet_device_info',
  help: 'Static device identity (always 1). Use to join labels in dashboards.',
  labelNames: readingLabels,
});

export const readingAgeSeconds = new Gauge({
  name: 'aranet_reading_age_seconds',
  help: 'Seconds since the sensor took the measurement in the latest advertisement.',
  labelNames: readingLabels,
});

export const lastReadingTimestamp = new Gauge({
  name: 'aranet_last_reading_timestamp_seconds',
  help: 'Unix timestamp of the measurement in the latest advertisement.',
  labelNames: readingLabels,
});

// ── Scan health ────────────────────────────────────────────────────────────

export const scannerUp = new Gauge({
  name: 'aranet_scanner_up',
  help: '1 once the BLE scan loop has completed at least one cycle.',
});

export const devicesTotal = new Gauge({
  name: 'aranet_devices_total',
  help: 'Number of enabled (managed) Aranet devices being polled.',
});

export const lastScanTimestamp = new Gauge({
  name: 'aranet_last_scan_timestamp_seconds',
  help: 'Unix timestamp of the most recent scan cycle.',
});

export const scanCyclesTotal = new Counter({
  name: 'aranet_scan_cycles_total',
  help: 'Total number of BLE scan cycles run since startup.',
});

export const scanErrorsTotal = new Counter({
  name: 'aranet_scan_errors_total',
  help: 'Total number of BLE scan cycles that threw before completing.',
});

/** Gauges reset+repopulated each publish, so removed devices drop cleanly. */
const PER_DEVICE_GAUGES = [
  co2Ppm,
  radonBqM3,
  temperatureCelsius,
  humidityPercent,
  pressureHpa,
  batteryPercent,
  status,
  deviceUp,
  deviceInfo,
  readingAgeSeconds,
  lastReadingTimestamp,
];

export function resetPerDeviceGauges(): void {
  for (const g of PER_DEVICE_GAUGES) g.reset();
}
