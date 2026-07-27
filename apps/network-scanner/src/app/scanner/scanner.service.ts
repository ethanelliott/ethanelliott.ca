import {
  DiscoveredHost,
  OpenPort,
  discover,
  scanPorts,
} from './nmap';
import { resolveMdnsNames, reverseDns } from './mdns';
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
}

const nowSec = () => Math.floor(Date.now() / 1000);

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

  // ── state ────────────────────────────────────────────────────────────────
  private readonly devices = new Map<string, DeviceState>();
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

    // First discovery seeds the baseline silently so we don't alert on the
    // devices already present when the scanner boots.
    await this.runDiscovery();
    this.baselineDone = true;
    console.log(`✅ Baseline established: ${this.devices.size} devices`);

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
  }

  stop(): void {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.portScanTimer) clearInterval(this.portScanTimer);
    if (this.nameTimer) clearInterval(this.nameTimer);
    this.discoveryTimer = null;
    this.portScanTimer = null;
    this.nameTimer = null;
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
    const newDevices: DeviceState[] = [];

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
        existing.deviceType = classify(existing.vendor, existing.ports, randomized, existing.model);
      } else {
        const device: DeviceState = {
          key,
          ip: h.ip,
          mac,
          vendor: h.vendor ?? '',
          hostname: h.hostname ?? '',
          name: '',
          mdnsHost: '',
          model: '',
          services: [],
          randomized,
          deviceType: classify(h.vendor ?? '', [], randomized),
          firstSeen: nowSec(),
          lastSeen: nowSec(),
          up: true,
          rttMs: h.rttMs,
          ports: [],
        };
        this.devices.set(key, device);
        const known = this.allowlist.has(mac);
        if (this.baselineDone && !known) newDevices.push(device);
      }
    }

    // Anything previously known but not seen this scan is now down.
    for (const [key, device] of this.devices) {
      if (!seen.has(key)) device.up = false;
    }

    m.scansTotal.inc({ scan_type: 'discovery' });
    m.scanDuration.set({ scan_type: 'discovery' }, (Date.now() - started) / 1000);
    m.lastScanTimestamp.set({ scan_type: 'discovery' }, nowSec());
    m.scannerUp.set(1);
    this.publish();

    for (const device of newDevices) await this.alertNewDevice(device);
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
        this.portScanTimeoutMs
      );
    } catch (err) {
      m.scanErrorsTotal.inc({ scan_type: 'port' });
      throw err;
    }

    const byIp = new Map(results.map((r) => [r.ip, r.ports]));
    for (const device of this.devices.values()) {
      if (!device.up) continue;
      const ports = byIp.get(device.ip);
      if (ports) {
        device.ports = ports.sort((a, b) => a.port - b.port);
        device.deviceType = classify(device.vendor, device.ports, device.randomized, device.model);
      }
    }

    m.scansTotal.inc({ scan_type: 'port' });
    m.scanDuration.set({ scan_type: 'port' }, (Date.now() - started) / 1000);
    m.lastScanTimestamp.set({ scan_type: 'port' }, nowSec());
    this.publish();
    console.log(
      `🔌 Port scan complete: ${results.reduce((n, r) => n + r.ports.length, 0)} open ports across ${upIps.length} hosts in ${((Date.now() - started) / 1000).toFixed(0)}s`
    );
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
    m.devicesByVendor.reset();
    m.devicesByType.reset();

    let upCount = 0;
    const vendorCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();

    for (const d of this.devices.values()) {
      const labels = {
        ip: d.ip,
        mac: d.mac || 'unknown',
        vendor: d.vendor || 'unknown',
        // Prefer the resolved friendly name; fall back to .local host / nmap name.
        hostname: d.name || d.mdnsHost || d.hostname || '',
        device_type: d.deviceType,
      };
      m.deviceUp.set(labels, d.up ? 1 : 0);
      m.deviceInfo.set(labels, 1);
      m.deviceLastSeen.set({ mac: d.mac || d.ip }, d.lastSeen);
      m.deviceFirstSeen.set({ mac: d.mac || d.ip }, d.firstSeen);

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

  private async alertNewDevice(device: DeviceState): Promise<void> {
    m.newDevicesTotal.inc();
    if (device.randomized && !this.alertOnRandomized) return;

    const vendor = device.vendor || 'unknown vendor';
    console.log(`🆕 New device: ${device.ip} ${device.mac} (${vendor})`);
    if (!this.ntfyEnabled) return;

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

    try {
      const res = await fetch(`${this.ntfyUrl}/${this.ntfyTopic}`, {
        method: 'POST',
        headers: {
          Title: 'New device on network',
          Priority: device.randomized ? 'low' : this.ntfyPriority,
          Tags: 'satellite,warning',
        },
        body: lines.join('\n'),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error(`ntfy failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.error('ntfy notification failed:', err);
    }
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
