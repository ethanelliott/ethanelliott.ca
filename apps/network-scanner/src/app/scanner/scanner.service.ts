import {
  DiscoveredHost,
  OpenPort,
  discover,
  scanPorts,
} from './nmap';
import { resolveMdnsNames, reverseDns } from './mdns';
import { checkTargets, resolveTiming, runSpeedTest } from './internet';
import * as m from './metrics';

export interface DeviceState {
  key: string; // stable identity: MAC when known, else IP
  ip: string;
  mac: string;
  vendor: string;
  hostname: string; // hostname from nmap (usually empty on this LAN)
  name: string; // best friendly name (mDNS fn > mDNS instance > reverse DNS)
  mdnsHost: string; // advertised .local hostname
  model: string; // mDNS model string, e.g. "Google Nest Hub"
  services: string[]; // mDNS service types the device advertises
  deviceType: string;
  randomized: boolean;
  firstSeen: number; // unix seconds
  lastSeen: number; // unix seconds
  up: boolean;
  rttMs?: number;
  ports: OpenPort[];
  misses: number; // consecutive discovery scans missed while down
  offlineAlerted: boolean; // an offline ntfy alert has been sent, awaiting recovery
  portsSeeded: boolean; // a first port scan has run, so new-port diffing is valid
  watched: boolean; // on the offline-alert watchlist
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Parse a comma-separated env value into a trimmed, lowercased list. */
const csv = (v?: string) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Locally-administered ("randomized") MACs have bit 1 of the first octet set. */
function isRandomizedMac(mac: string): boolean {
  const firstOctet = parseInt(mac.split(':')[0] ?? '0', 16);
  return (firstOctet & 0x02) === 0x02;
}

/** Infer a friendly device type from mDNS model + vendor + open ports (best-effort). */
function classify(
  vendor: string,
  ports: OpenPort[],
  randomized: boolean,
  model = ''
): string {
  const v = vendor.toLowerCase();
  const md = model.toLowerCase();
  const p = new Set(ports.map((x) => x.port));
  const has = (...xs: number[]) => xs.some((x) => p.has(x));

  // mDNS model is the most reliable signal when we have it.
  if (md.includes('chromecast')) return 'chromecast';
  if (md.includes('nest hub') || md.includes('nest display')) return 'smart-display';
  if (md.includes('home') || md.includes('nest audio') || md.includes('nest mini') ||
      md.includes('nest wifi')) return 'smart-speaker';
  if (md.includes('homepod') || md.includes('apple tv')) return 'apple-media';

  if (v.includes('google')) {
    if (has(8008, 8009)) return 'google-cast';
    if (has(8080, 8443)) return 'google-nest-wifi';
    return 'google-device';
  }
  if (v.includes('espressif')) return 'esp-iot';
  if (v.includes('tuya')) return 'tuya-smart';
  if (v.includes('meross')) return 'meross-smart';
  if (v.includes('tp-link') || v.includes('tplink')) return 'tplink-kasa';
  if (v.includes('altobeam')) return 'iot-appliance';
  if (v.includes('canon') || v.includes('epson') || v.includes('brother') || has(631)) {
    return 'printer';
  }
  if (v.includes('dell') || v.includes('intel') || v.includes('supermicro')) {
    if (has(445)) return 'pc-windows';
    if (has(22)) return 'server-linux';
    return 'computer';
  }
  if (v.includes('apple') || v.includes('raspberry')) return 'computer';
  if (has(554)) return 'camera';
  if (has(1883)) return 'mqtt-broker';
  if (randomized) return 'phone-laptop';
  return 'unknown';
}

export class ScannerService {
  // ── configuration (env-overridable) ─────────────────────────────────────
  private readonly target = process.env.SCAN_TARGET || '192.168.86.0/24';
  private readonly discoveryIntervalMs =
    Number(process.env.DISCOVERY_INTERVAL_SECONDS || 60) * 1000;
  private readonly discoveryTimeoutMs =
    Number(process.env.DISCOVERY_TIMEOUT_SECONDS || 60) * 1000;

  private readonly portScanEnabled =
    (process.env.PORT_SCAN_ENABLED || 'true') === 'true';
  private readonly portScanIntervalMs =
    Number(process.env.PORT_SCAN_INTERVAL_MINUTES || 60) * 60 * 1000;
  private readonly portScanPorts = process.env.PORT_SCAN_PORTS || '1-65535';
  private readonly portScanTiming = process.env.PORT_SCAN_TIMING || '-T4';
  private readonly portScanMinRate = Number(process.env.PORT_SCAN_MIN_RATE || 2000);
  private readonly portScanTimeoutMs =
    Number(process.env.PORT_SCAN_TIMEOUT_SECONDS || 1200) * 1000;
  // Add nmap -sV to the port scan to fingerprint service/product/version.
  private readonly serviceDetection =
    (process.env.PORT_SCAN_SERVICE_DETECTION || 'true') === 'true';

  private readonly internetEnabled =
    (process.env.INTERNET_CHECK_ENABLED || 'true') === 'true';
  private readonly internetIntervalMs =
    Number(process.env.INTERNET_CHECK_INTERVAL_SECONDS || 30) * 1000;
  private readonly internetTargets = (
    process.env.INTERNET_CHECK_TARGETS || '1.1.1.1:443,8.8.8.8:443,1.1.1.1:53'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  private readonly internetAttempts = Number(process.env.INTERNET_CHECK_ATTEMPTS || 3);
  private readonly internetTimeoutMs =
    Number(process.env.INTERNET_CHECK_TIMEOUT_SECONDS || 3) * 1000;
  private readonly internetDnsHost = process.env.INTERNET_DNS_HOST || 'google.com';
  private readonly internetAlertEnabled =
    (process.env.INTERNET_ALERT_ENABLED || 'true') === 'true';
  private readonly internetDownAfterMisses =
    Number(process.env.INTERNET_DOWN_AFTER_MISSES || 2);

  // Periodic Cloudflare throughput test. Each run moves real data across the
  // WAN, so it's deliberately infrequent (default every 6h).
  private readonly speedTestEnabled =
    (process.env.SPEEDTEST_ENABLED || 'true') === 'true';
  private readonly speedTestIntervalMs =
    Number(process.env.SPEEDTEST_INTERVAL_MINUTES || 360) * 60 * 1000;
  private readonly speedTestDownloadBytes =
    Number(process.env.SPEEDTEST_DOWNLOAD_MB || 50) * 1024 * 1024;
  private readonly speedTestUploadBytes =
    Number(process.env.SPEEDTEST_UPLOAD_MB || 10) * 1024 * 1024;
  private readonly speedTestTimeoutMs =
    Number(process.env.SPEEDTEST_TIMEOUT_SECONDS || 60) * 1000;

  private readonly ntfyEnabled = (process.env.NTFY_ENABLED || 'true') === 'true';
  private readonly ntfyUrl = process.env.NTFY_URL || 'https://ntfy.elliott.haus';
  private readonly ntfyTopic = process.env.NTFY_TOPIC || 'network';
  // ntfy priority for regular new-device alerts (1=min … 3=default … 5=max).
  // Randomized-MAC devices always drop one notch below this.
  private readonly ntfyPriority = process.env.NTFY_PRIORITY || 'default';
  private readonly alertOnRandomized =
    (process.env.ALERT_ON_RANDOMIZED_MAC || 'true') === 'true';

  private readonly nameResolutionEnabled =
    (process.env.NAME_RESOLUTION_ENABLED || 'true') === 'true';
  private readonly nameResolutionIntervalMs =
    Number(process.env.NAME_RESOLUTION_INTERVAL_MINUTES || 15) * 60 * 1000;
  private readonly mdnsBrowseMs =
    Number(process.env.MDNS_BROWSE_SECONDS || 8) * 1000;
  private readonly reverseDnsEnabled =
    (process.env.REVERSE_DNS_ENABLED || 'true') === 'true';

  // Offline / change alerting.
  private readonly watchMacs = new Set(csv(process.env.WATCH_MACS));
  private readonly watchNames = csv(process.env.WATCH_NAMES);
  private readonly offlineAfterMisses = Number(process.env.OFFLINE_AFTER_MISSES || 3);
  private readonly alertOnNewPorts =
    (process.env.ALERT_ON_NEW_PORTS || 'true') === 'true';
  private readonly alertOnNewVendor =
    (process.env.ALERT_ON_NEW_VENDOR || 'true') === 'true';

  // ── state ────────────────────────────────────────────────────────────────
  private readonly devices = new Map<string, DeviceState>();
  private readonly knownVendors = new Set<string>();
  private readonly allowlist = new Set(
    (process.env.KNOWN_MACS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  private baselineDone = false;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private portScanTimer: ReturnType<typeof setInterval> | null = null;
  private nameTimer: ReturnType<typeof setInterval> | null = null;
  private internetTimer: ReturnType<typeof setInterval> | null = null;
  private internetMisses = 0;
  private internetDownAlerted = false;
  private speedTestTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    console.log(`🛰️  Scanner target: ${this.target}`);
    console.log(
      `🔎 Discovery every ${this.discoveryIntervalMs / 1000}s; port scan ${
        this.portScanEnabled
          ? `every ${this.portScanIntervalMs / 60000}min (ports ${this.portScanPorts})`
          : 'disabled'
      }`
    );
    console.log(
      `📢 ntfy ${this.ntfyEnabled ? `→ ${this.ntfyUrl}/${this.ntfyTopic}` : 'disabled'}`
    );
    console.log(
      `🏷️  Name resolution ${
        this.nameResolutionEnabled
          ? `every ${this.nameResolutionIntervalMs / 60000}min (mDNS/DNS-SD${this.reverseDnsEnabled ? ' + reverse DNS' : ''})`
          : 'disabled'
      }`
    );
    console.log(
      `🔔 Alerts — watchlist: ${
        this.watchMacs.size + this.watchNames.length || 'none'
      }, new-port: ${this.alertOnNewPorts}, new-vendor: ${this.alertOnNewVendor}`
    );

    // First discovery seeds the baseline silently (runDiscovery marks baseline
    // once it succeeds). Wrapped so a transient first-scan failure doesn't stop
    // the other loops (port scan, name resolution, internet health) from running.
    try {
      await this.runDiscovery();
    } catch (e) {
      console.error('initial discovery failed; baseline will be set on first success:', e);
    }

    this.discoveryTimer = setInterval(() => {
      this.runDiscovery().catch((e) => console.error('discovery failed:', e));
    }, this.discoveryIntervalMs);

    if (this.portScanEnabled) {
      // Kick off an initial port scan shortly after boot, then on interval.
      this.runPortScan().catch((e) => console.error('port scan failed:', e));
      this.portScanTimer = setInterval(() => {
        this.runPortScan().catch((e) => console.error('port scan failed:', e));
      }, this.portScanIntervalMs);
    }

    if (this.nameResolutionEnabled) {
      this.runNameResolution().catch((e) => console.error('name resolution failed:', e));
      this.nameTimer = setInterval(() => {
        this.runNameResolution().catch((e) => console.error('name resolution failed:', e));
      }, this.nameResolutionIntervalMs);
    }

    if (this.internetEnabled) {
      console.log(
        `🌐 Internet health every ${this.internetIntervalMs / 1000}s → ${this.internetTargets.join(', ')}`
      );
      this.runInternetCheck().catch((e) => console.error('internet check failed:', e));
      this.internetTimer = setInterval(() => {
        this.runInternetCheck().catch((e) => console.error('internet check failed:', e));
      }, this.internetIntervalMs);
    }

    if (this.speedTestEnabled) {
      console.log(
        `🚀 Speed test every ${this.speedTestIntervalMs / 60000}min ` +
          `(↓${this.speedTestDownloadBytes / 1024 / 1024}MB ↑${this.speedTestUploadBytes / 1024 / 1024}MB via Cloudflare)`
      );
      // Kick off an initial run shortly after boot, then on interval.
      this.runSpeedTest().catch((e) => console.error('speed test failed:', e));
      this.speedTestTimer = setInterval(() => {
        this.runSpeedTest().catch((e) => console.error('speed test failed:', e));
      }, this.speedTestIntervalMs);
    }
  }

  stop(): void {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.portScanTimer) clearInterval(this.portScanTimer);
    if (this.nameTimer) clearInterval(this.nameTimer);
    if (this.internetTimer) clearInterval(this.internetTimer);
    if (this.speedTestTimer) clearInterval(this.speedTestTimer);
    this.discoveryTimer = null;
    this.portScanTimer = null;
    this.nameTimer = null;
    this.internetTimer = null;
    this.speedTestTimer = null;
    console.log('🛑 Network scanner stopped');
  }

  // ── scans ─────────────────────────────────────────────────────────────────

  private async runDiscovery(): Promise<void> {
    const started = Date.now();
    let hosts: DiscoveredHost[];
    try {
      hosts = await discover(this.target, this.discoveryTimeoutMs);
    } catch (err) {
      m.scanErrorsTotal.inc({ scan_type: 'discovery' });
      throw err;
    }

    const seen = new Set<string>();
    const newDevices: { device: DeviceState; newVendor: boolean }[] = [];

    for (const h of hosts) {
      const mac = h.mac ?? '';
      const key = mac || h.ip;
      seen.add(key);
      const randomized = mac ? isRandomizedMac(mac) : false;
      const existing = this.devices.get(key);

      if (existing) {
        existing.ip = h.ip;
        existing.vendor = h.vendor ?? existing.vendor;
        existing.hostname = h.hostname ?? existing.hostname;
        existing.rttMs = h.rttMs;
        existing.lastSeen = nowSec();
        existing.up = true;
        existing.watched = this.isWatched(existing);
        existing.deviceType = classify(existing.vendor, existing.ports, randomized, existing.model);
        if (existing.vendor) this.knownVendors.add(existing.vendor.toLowerCase());
      } else {
        const vendor = h.vendor ?? '';
        const newVendor =
          this.baselineDone && !!vendor && !this.knownVendors.has(vendor.toLowerCase());
        const device: DeviceState = {
          key,
          ip: h.ip,
          mac,
          vendor,
          hostname: h.hostname ?? '',
          name: '',
          mdnsHost: '',
          model: '',
          services: [],
          randomized,
          deviceType: classify(vendor, [], randomized),
          firstSeen: nowSec(),
          lastSeen: nowSec(),
          up: true,
          rttMs: h.rttMs,
          ports: [],
          misses: 0,
          offlineAlerted: false,
          portsSeeded: false,
          watched: false,
        };
        device.watched = this.isWatched(device);
        this.devices.set(key, device);
        if (vendor) this.knownVendors.add(vendor.toLowerCase());
        const known = this.allowlist.has(mac);
        if (this.baselineDone && !known) newDevices.push({ device, newVendor });
      }
    }

    // Reconcile up/down transitions and gather offline/recovery alerts.
    const offlineAlerts: DeviceState[] = [];
    const recoveryAlerts: DeviceState[] = [];
    for (const [key, device] of this.devices) {
      if (seen.has(key)) {
        device.misses = 0;
        if (device.offlineAlerted) {
          device.offlineAlerted = false;
          if (device.watched) recoveryAlerts.push(device);
        }
      } else {
        device.up = false;
        device.misses++;
        if (
          device.watched &&
          !device.offlineAlerted &&
          device.misses >= this.offlineAfterMisses
        ) {
          device.offlineAlerted = true;
          offlineAlerts.push(device);
        }
      }
    }

    m.scansTotal.inc({ scan_type: 'discovery' });
    m.scanDuration.set({ scan_type: 'discovery' }, (Date.now() - started) / 1000);
    m.lastScanTimestamp.set({ scan_type: 'discovery' }, nowSec());
    m.scannerUp.set(1);
    this.publish();

    // The first successful scan is the silent baseline (no alerts fired above,
    // since newDevices only fills once baselineDone is true).
    if (!this.baselineDone) {
      this.baselineDone = true;
      console.log(`✅ Baseline established: ${this.devices.size} devices`);
    }

    for (const { device, newVendor } of newDevices) await this.alertNewDevice(device, newVendor);
    for (const device of offlineAlerts) await this.alertOffline(device);
    for (const device of recoveryAlerts) await this.alertOnline(device);
  }

  /** True if the device matches the offline-alert watchlist (MAC or name substring). */
  private isWatched(d: DeviceState): boolean {
    if (this.watchMacs.has(d.mac.toLowerCase())) return true;
    const haystacks = [d.name, d.mdnsHost, d.hostname]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return this.watchNames.some((w) => haystacks.some((h) => h.includes(w)));
  }

  private async runPortScan(): Promise<void> {
    const started = Date.now();
    const upIps = [...this.devices.values()].filter((d) => d.up).map((d) => d.ip);
    if (upIps.length === 0) return;

    let results;
    try {
      results = await scanPorts(
        upIps,
        this.portScanPorts,
        this.portScanTiming,
        this.portScanMinRate,
        this.portScanTimeoutMs,
        this.serviceDetection
      );
    } catch (err) {
      m.scanErrorsTotal.inc({ scan_type: 'port' });
      throw err;
    }

    const byIp = new Map(results.map((r) => [r.ip, r.ports]));
    const newPortAlerts: { device: DeviceState; ports: OpenPort[] }[] = [];
    for (const device of this.devices.values()) {
      if (!device.up) continue;
      const ports = byIp.get(device.ip);
      if (!ports) continue;

      // Diff against the previously-known ports (only once a baseline exists).
      if (device.portsSeeded && this.alertOnNewPorts) {
        const before = new Set(device.ports.map((p) => p.port));
        const added = ports.filter((p) => !before.has(p.port));
        if (added.length) newPortAlerts.push({ device, ports: added });
      }

      device.ports = ports.sort((a, b) => a.port - b.port);
      device.portsSeeded = true;
      device.deviceType = classify(device.vendor, device.ports, device.randomized, device.model);
    }

    m.scansTotal.inc({ scan_type: 'port' });
    m.scanDuration.set({ scan_type: 'port' }, (Date.now() - started) / 1000);
    m.lastScanTimestamp.set({ scan_type: 'port' }, nowSec());
    this.publish();
    console.log(
      `🔌 Port scan complete: ${results.reduce((n, r) => n + r.ports.length, 0)} open ports across ${upIps.length} hosts in ${((Date.now() - started) / 1000).toFixed(0)}s`
    );

    for (const { device, ports } of newPortAlerts) await this.alertNewPorts(device, ports);
  }

  private async runNameResolution(): Promise<void> {
    const started = Date.now();
    // Index currently-up devices by IP so we can attach names.
    const byIp = new Map<string, DeviceState>();
    for (const d of this.devices.values()) if (d.up) byIp.set(d.ip, d);
    if (byIp.size === 0) return;

    // 1) mDNS / DNS-SD → friendly name, .local host, model, advertised services.
    let named = 0;
    try {
      const mdns = await resolveMdnsNames(this.mdnsBrowseMs);
      for (const [ip, r] of mdns) {
        const device = byIp.get(ip);
        if (!device) continue;
        if (r.name) device.name = r.name;
        if (r.host) device.mdnsHost = r.host;
        if (r.model) device.model = r.model;
        if (r.services.length) {
          device.services = [...new Set([...device.services, ...r.services])];
        }
        device.deviceType = classify(device.vendor, device.ports, device.randomized, device.model);
        // Names may now match WATCH_NAMES — refresh the watch flag immediately.
        device.watched = this.isWatched(device);
        named++;
      }
    } catch (err) {
      console.error('mDNS resolution failed:', err);
    }

    // 2) Reverse-DNS fallback for up devices that still have no friendly name.
    if (this.reverseDnsEnabled) {
      const pending = [...byIp.values()].filter((d) => !d.name);
      await Promise.all(
        pending.map(async (d) => {
          const ptr = await reverseDns(d.ip);
          if (ptr) d.name = ptr;
        })
      );
    }

    this.publish();
    console.log(
      `🏷️  Name resolution: ${named} devices named via mDNS in ${((Date.now() - started) / 1000).toFixed(0)}s`
    );
  }

  private async runInternetCheck(): Promise<void> {
    m.internetChecksTotal.inc();
    const results = await checkTargets(
      this.internetTargets,
      this.internetAttempts,
      this.internetTimeoutMs
    );
    let anyUp = false;
    for (const r of results) {
      m.internetSuccessRatio.set({ target: r.target }, r.attempts ? r.successes / r.attempts : 0);
      if (r.rttMs !== undefined) m.internetRttMs.set({ target: r.target }, r.rttMs);
      if (r.successes > 0) anyUp = true;
    }
    m.internetUp.set(anyUp ? 1 : 0);

    const dnsSec = await resolveTiming(this.internetDnsHost, this.internetTimeoutMs);
    if (dnsSec !== null) m.internetDnsResolveSeconds.set({ host: this.internetDnsHost }, dnsSec);

    // Down / recovery detection, debounced by INTERNET_DOWN_AFTER_MISSES.
    if (anyUp) {
      this.internetMisses = 0;
      if (this.internetDownAlerted) {
        this.internetDownAlerted = false;
        console.log('🌐 Internet recovered');
        if (this.internetAlertEnabled) {
          await this.notify(
            'Internet back online',
            'WAN connectivity has recovered.',
            'globe_with_meridians,green_circle',
            'low'
          );
        }
      }
    } else {
      this.internetMisses++;
      if (!this.internetDownAlerted && this.internetMisses >= this.internetDownAfterMisses) {
        this.internetDownAlerted = true;
        m.internetDownEventsTotal.inc();
        console.log('🌐 Internet DOWN');
        if (this.internetAlertEnabled) {
          await this.notify(
            'Internet is DOWN',
            `No internet targets reachable (${this.internetTargets.join(', ')}).`,
            'globe_with_meridians,red_circle',
            this.ntfyPriority
          );
        }
      }
    }
  }

  private async runSpeedTest(): Promise<void> {
    m.internetSpeedtestsTotal.inc();
    const started = Date.now();
    try {
      const r = await runSpeedTest({
        downloadBytes: this.speedTestDownloadBytes,
        uploadBytes: this.speedTestUploadBytes,
        timeoutMs: this.speedTestTimeoutMs,
      });
      m.internetDownloadMbps.set(r.downloadMbps);
      m.internetUploadMbps.set(r.uploadMbps);
      if (r.latencyMs !== undefined) m.internetSpeedtestLatencyMs.set(r.latencyMs);
      m.internetSpeedtestTimestamp.set(nowSec());
      console.log(
        `🚀 Speed test: ↓${r.downloadMbps.toFixed(1)} ↑${r.uploadMbps.toFixed(1)} Mbps` +
          `${r.latencyMs !== undefined ? ` (${r.latencyMs}ms)` : ''} ` +
          `in ${((Date.now() - started) / 1000).toFixed(0)}s`
      );
    } catch (err) {
      m.internetSpeedtestErrorsTotal.inc();
      console.error('speed test failed:', err);
    }
  }

  // ── metric publishing ──────────────────────────────────────────────────────

  /** Reset and fully repopulate every gauge from the in-memory device map. */
  private publish(): void {
    m.deviceUp.reset();
    m.deviceInfo.reset();
    m.deviceLastSeen.reset();
    m.deviceFirstSeen.reset();
    m.deviceRtt.reset();
    m.deviceOpenPorts.reset();
    m.devicePortOpen.reset();
    m.deviceServiceInfo.reset();
    m.devicesByVendor.reset();
    m.devicesByType.reset();
    m.deviceWatched.reset();

    let upCount = 0;
    const vendorCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();

    for (const d of this.devices.values()) {
      const labels = {
        ip: d.ip,
        mac: d.mac || 'unknown',
        vendor: d.vendor || 'unknown',
        // Prefer the resolved friendly name; fall back to .local host / nmap
        // name, and finally the IP so every device is identifiable & selectable.
        hostname: d.name || d.mdnsHost || d.hostname || d.ip,
        device_type: d.deviceType,
      };
      m.deviceUp.set(labels, d.up ? 1 : 0);
      m.deviceInfo.set(labels, 1);
      m.deviceLastSeen.set(
        { mac: d.mac || d.ip, ip: d.ip, hostname: labels.hostname },
        d.lastSeen
      );
      m.deviceFirstSeen.set({ mac: d.mac || d.ip }, d.firstSeen);
      if (d.watched) {
        m.deviceWatched.set({ ip: d.ip, mac: d.mac || 'unknown', hostname: labels.hostname }, 1);
      }

      if (d.up) {
        upCount++;
        if (d.rttMs !== undefined) m.deviceRtt.set({ ip: d.ip, mac: d.mac || 'unknown' }, d.rttMs);
        m.deviceOpenPorts.set({ ip: d.ip, mac: d.mac || 'unknown' }, d.ports.length);
        for (const port of d.ports) {
          m.devicePortOpen.set(
            {
              ip: d.ip,
              mac: d.mac || 'unknown',
              port: String(port.port),
              service: port.service || 'unknown',
            },
            1
          );
          if (port.product || port.version) {
            m.deviceServiceInfo.set(
              {
                ip: d.ip,
                mac: d.mac || 'unknown',
                port: String(port.port),
                service: port.service || 'unknown',
                product: port.product || '',
                version: port.version || '',
              },
              1
            );
          }
        }
        const vendor = d.vendor || 'unknown';
        vendorCounts.set(vendor, (vendorCounts.get(vendor) ?? 0) + 1);
        typeCounts.set(d.deviceType, (typeCounts.get(d.deviceType) ?? 0) + 1);
      }
    }

    for (const [vendor, count] of vendorCounts) m.devicesByVendor.set({ vendor }, count);
    for (const [type, count] of typeCounts) m.devicesByType.set({ device_type: type }, count);
    m.devicesTotal.set(upCount);
    m.devicesKnownTotal.set(this.devices.size);
  }

  // ── notifications ───────────────────────────────────────────────────────────

  private label(d: DeviceState): string {
    const name = d.name || d.mdnsHost || d.hostname;
    return name ? `${name} (${d.ip})` : d.ip;
  }

  /** Post a single ntfy message. Never throws. */
  private async notify(
    title: string,
    body: string,
    tags: string,
    priority: string
  ): Promise<void> {
    if (!this.ntfyEnabled) return;
    try {
      const res = await fetch(`${this.ntfyUrl}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: { Title: title, Priority: priority, Tags: tags },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error(`ntfy failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.error('ntfy notification failed:', err);
    }
  }

  private async alertNewDevice(device: DeviceState, newVendor: boolean): Promise<void> {
    m.newDevicesTotal.inc();
    if (newVendor && this.alertOnNewVendor) m.newVendorsTotal.inc();
    if (device.randomized && !this.alertOnRandomized) return;

    const vendor = device.vendor || 'unknown vendor';
    console.log(`🆕 New device: ${device.ip} ${device.mac} (${vendor})${newVendor ? ' [new vendor]' : ''}`);

    const friendly = device.name || device.mdnsHost || device.hostname;
    const lines = [
      `A new device joined the network.`,
      ``,
      `IP: ${device.ip}`,
      `MAC: ${device.mac || 'unknown'}${device.randomized ? ' (randomized)' : ''}`,
      `Vendor: ${vendor}`,
      `Type: ${device.deviceType}`,
    ];
    if (friendly) lines.push(`Name: ${friendly}`);
    if (newVendor && this.alertOnNewVendor) {
      lines.push('', '⚠️ First device ever seen from this vendor.');
    }

    await this.notify(
      newVendor ? 'New device (new vendor!) on network' : 'New device on network',
      lines.join('\n'),
      'satellite,warning',
      device.randomized ? 'low' : this.ntfyPriority
    );
  }

  private async alertOffline(device: DeviceState): Promise<void> {
    m.offlineEventsTotal.inc();
    console.log(`📴 Watched device offline: ${this.label(device)}`);
    const mins = Math.round((device.misses * this.discoveryIntervalMs) / 60000);
    await this.notify(
      'Device went offline',
      [
        `A watched device dropped off the network.`,
        ``,
        `Device: ${this.label(device)}`,
        `MAC: ${device.mac || 'unknown'}`,
        `Last seen: ~${mins} min ago`,
      ].join('\n'),
      'satellite,red_circle',
      this.ntfyPriority
    );
  }

  private async alertOnline(device: DeviceState): Promise<void> {
    console.log(`📶 Watched device back online: ${this.label(device)}`);
    await this.notify(
      'Device back online',
      `${this.label(device)} is back on the network.`,
      'satellite,green_circle',
      'low'
    );
  }

  private async alertNewPorts(device: DeviceState, ports: OpenPort[]): Promise<void> {
    m.newPortsTotal.inc(ports.length);
    const list = ports.map((p) => {
      const detail = [p.service, p.product, p.version].filter(Boolean).join(' ');
      return `${p.port}/${p.protocol}${detail ? ` (${detail})` : ''}`;
    });
    console.log(`🔓 New port(s) on ${this.label(device)}: ${list.join(', ')}`);
    await this.notify(
      'New open port detected',
      [
        `A device opened a port it wasn't serving before.`,
        ``,
        `Device: ${this.label(device)}`,
        `MAC: ${device.mac || 'unknown'}`,
        `New port(s): ${list.join(', ')}`,
      ].join('\n'),
      'satellite,lock',
      this.ntfyPriority
    );
  }

  // ── read model (for the JSON API) ────────────────────────────────────────────

  snapshot() {
    const devices = [...this.devices.values()].sort((a, b) => {
      const oa = Number(a.ip.split('.')[3] ?? 0);
      const ob = Number(b.ip.split('.')[3] ?? 0);
      return oa - ob;
    });
    return {
      target: this.target,
      total: devices.length,
      up: devices.filter((d) => d.up).length,
      baselineReady: this.baselineDone,
      devices,
    };
  }
}
