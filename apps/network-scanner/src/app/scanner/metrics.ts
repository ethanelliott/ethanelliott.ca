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

export const deviceServiceInfo = new Gauge({
  name: 'network_device_service_info',
  help: 'Service/version fingerprint per open port from nmap -sV (always 1).',
  labelNames: ['ip', 'mac', 'port', 'service', 'product', 'version'],
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

// ── Internet / WAN health ─────────────────────────────────────────────────

export const internetUp = new Gauge({
  name: 'internet_up',
  help: '1 if any internet target was reachable in the last check.',
});

export const internetRttMs = new Gauge({
  name: 'internet_rtt_ms',
  help: 'Average TCP-handshake RTT to an internet target (ms).',
  labelNames: ['target'],
});

export const internetSuccessRatio = new Gauge({
  name: 'internet_probe_success_ratio',
  help: 'Fraction of successful TCP probes to an internet target (0-1).',
  labelNames: ['target'],
});

export const internetDnsResolveSeconds = new Gauge({
  name: 'internet_dns_resolve_seconds',
  help: 'Time to resolve a well-known hostname via the pod resolver.',
  labelNames: ['host'],
});

export const internetChecksTotal = new Counter({
  name: 'internet_checks_total',
  help: 'Total number of internet-health checks run.',
});

export const internetDownEventsTotal = new Counter({
  name: 'internet_down_events_total',
  help: 'Total number of times the internet was detected down.',
});

// ── Internet / WAN throughput (speed test) ────────────────────────────────

export const internetDownloadMbps = new Gauge({
  name: 'internet_speedtest_download_mbps',
  help: 'Download throughput from the most recent speed test (Mbps).',
});

export const internetUploadMbps = new Gauge({
  name: 'internet_speedtest_upload_mbps',
  help: 'Upload throughput from the most recent speed test (Mbps).',
});

export const internetSpeedtestLatencyMs = new Gauge({
  name: 'internet_speedtest_latency_ms',
  help: 'Idle latency to the speed-test edge from the most recent test (ms).',
});

export const internetSpeedtestTimestamp = new Gauge({
  name: 'internet_speedtest_timestamp_seconds',
  help: 'Unix timestamp of the most recent successful speed test.',
});

export const internetSpeedtestsTotal = new Counter({
  name: 'internet_speedtests_total',
  help: 'Total number of speed tests run.',
});

export const internetSpeedtestErrorsTotal = new Counter({
  name: 'internet_speedtest_errors_total',
  help: 'Total number of failed speed tests.',
});
