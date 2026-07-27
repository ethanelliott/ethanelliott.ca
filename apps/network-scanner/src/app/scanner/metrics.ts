import { Counter, Gauge } from 'prom-client';

/**
 * All custom metrics register on prom-client's default registry, which is the
 * same registry `fastify-metrics` serves at `/metrics`. No manual wiring needed.
 *
 * Cardinality note: every per-device gauge is `.reset()` and fully repopulated
 * on each publish from the in-memory device map (keyed by MAC), so IP/hostname
 * churn never leaves stale duplicate series — there is exactly one series per
 * known MAC.
 */

// ── Per-device presence & identity ────────────────────────────────────────

export const deviceUp = new Gauge({
  name: 'network_device_up',
  help: '1 if the device responded to the most recent discovery scan, else 0.',
  labelNames: ['ip', 'mac', 'vendor', 'hostname', 'device_type'],
});

export const deviceInfo = new Gauge({
  name: 'network_device_info',
  help: 'Static device info (always 1). Use to join labels in dashboards/tables.',
  labelNames: ['ip', 'mac', 'vendor', 'hostname', 'device_type'],
});

export const deviceLastSeen = new Gauge({
  name: 'network_device_last_seen_timestamp_seconds',
  help: 'Unix timestamp when the device was last seen up.',
  labelNames: ['mac', 'ip', 'hostname'],
});

export const deviceFirstSeen = new Gauge({
  name: 'network_device_first_seen_timestamp_seconds',
  help: 'Unix timestamp when the device was first ever seen by the scanner.',
  labelNames: ['mac'],
});

export const deviceRtt = new Gauge({
  name: 'network_device_response_time_ms',
  help: 'Round-trip time to the device from the last discovery scan (ms).',
  labelNames: ['ip', 'mac'],
});

// ── Per-device open ports ─────────────────────────────────────────────────

export const deviceOpenPorts = new Gauge({
  name: 'network_device_open_ports',
  help: 'Number of open TCP ports found on the device by the last port scan.',
  labelNames: ['ip', 'mac'],
});

export const devicePortOpen = new Gauge({
  name: 'network_device_port_open',
  help: 'One series per open TCP port on a device (always 1).',
  labelNames: ['ip', 'mac', 'port', 'service'],
});

// ── Aggregates ────────────────────────────────────────────────────────────

export const devicesTotal = new Gauge({
  name: 'network_devices_total',
  help: 'Number of devices currently up on the network.',
});

export const devicesKnownTotal = new Gauge({
  name: 'network_devices_known_total',
  help: 'Number of devices the scanner has ever seen (up or down).',
});

export const devicesByVendor = new Gauge({
  name: 'network_devices_by_vendor',
  help: 'Count of currently-up devices grouped by vendor.',
  labelNames: ['vendor'],
});

export const devicesByType = new Gauge({
  name: 'network_devices_by_type',
  help: 'Count of currently-up devices grouped by inferred device type.',
  labelNames: ['device_type'],
});

// ── Scan health ───────────────────────────────────────────────────────────

export const scannerUp = new Gauge({
  name: 'network_scanner_up',
  help: '1 once the scanner has completed at least one discovery scan.',
});

export const scanDuration = new Gauge({
  name: 'network_scan_duration_seconds',
  help: 'Duration of the most recent scan, by scan type.',
  labelNames: ['scan_type'],
});

export const lastScanTimestamp = new Gauge({
  name: 'network_last_scan_timestamp_seconds',
  help: 'Unix timestamp of the most recent successful scan, by scan type.',
  labelNames: ['scan_type'],
});

export const scansTotal = new Counter({
  name: 'network_scans_total',
  help: 'Total number of scans run, by scan type.',
  labelNames: ['scan_type'],
});

export const scanErrorsTotal = new Counter({
  name: 'network_scan_errors_total',
  help: 'Total number of failed scans, by scan type.',
  labelNames: ['scan_type'],
});

export const newDevicesTotal = new Counter({
  name: 'network_new_devices_total',
  help: 'Total number of never-before-seen devices detected since startup.',
});

export const newVendorsTotal = new Counter({
  name: 'network_new_vendors_total',
  help: 'Total number of never-before-seen vendors detected since startup.',
});

export const newPortsTotal = new Counter({
  name: 'network_new_ports_total',
  help: 'Total number of newly-opened ports detected on known devices.',
});

export const offlineEventsTotal = new Counter({
  name: 'network_offline_events_total',
  help: 'Total number of times a watched device dropped offline.',
});

export const deviceWatched = new Gauge({
  name: 'network_device_watched',
  help: '1 if the device is on the offline-alert watchlist.',
  labelNames: ['ip', 'mac', 'hostname'],
});
