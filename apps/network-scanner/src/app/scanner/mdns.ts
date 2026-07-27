import { Bonjour } from 'bonjour-service';
import { promises as dns } from 'node:dns';

export interface ResolvedName {
  ip: string;
  name?: string; // best friendly name (txt.fn > service instance name)
  host?: string; // advertised .local hostname
  model?: string; // txt.md, e.g. "Google Nest Hub" / "Chromecast"
  services: string[];
}

/**
 * Common DNS-SD service types worth browsing on a home LAN. Google/Apple/printer/
 * ESPHome/HomeKit/Sonos devices all advertise here; cloud IoT (Tuya/Kasa/Meross)
 * generally does not, so those simply keep their vendor identity.
 */
const SERVICE_TYPES = [
  'googlecast',
  'airplay',
  'raop',
  'spotify-connect',
  'http',
  'https',
  'ipp',
  'ipps',
  'printer',
  'pdl-datastream',
  'esphome',
  'hap',
  'companion-link',
  'sonos',
  'workstation',
  'smb',
  'ssh',
  'device-info',
  'amzn-wplay',
  'matter',
  'matterc',
];

/**
 * Browse mDNS/DNS-SD for `durationMs` and return an IP → name map. Never rejects:
 * on any failure (e.g. UDP 5353 unavailable in the pod) it resolves what it has.
 */
export function resolveMdnsNames(durationMs: number): Promise<Map<string, ResolvedName>> {
  return new Promise((resolve) => {
    const results = new Map<string, ResolvedName>();
    let bonjour: InstanceType<typeof Bonjour>;
    try {
      bonjour = new Bonjour();
    } catch (err) {
      console.error('mDNS init failed:', err);
      resolve(results);
      return;
    }

    const browsers = SERVICE_TYPES.map((type) =>
      bonjour.find({ type }, (service) => {
        const txt = (service.txt ?? {}) as Record<string, string>;
        const friendly = txt.fn || service.name;
        for (const addr of service.addresses ?? []) {
          if (!addr.includes('.')) continue; // IPv4 only
          const entry: ResolvedName = results.get(addr) ?? { ip: addr, services: [] };
          if (!entry.services.includes(type)) entry.services.push(type);
          // Prefer the user-assigned friendly name (fn) when present.
          if (txt.fn) entry.name = txt.fn;
          else if (!entry.name && friendly) entry.name = friendly;
          if (!entry.host && service.host) entry.host = service.host;
          // txt.md is a real model on Cast devices ("Google Nest Hub"); on
          // AirPlay it's a numeric feature-flag list ("0,1,2") — ignore those.
          if (!entry.model && txt.md && !/^[\d,]+$/.test(txt.md)) entry.model = txt.md;
          results.set(addr, entry);
        }
      })
    );

    setTimeout(() => {
      try {
        for (const b of browsers) b.stop();
        bonjour.destroy();
      } catch {
        /* ignore teardown errors */
      }
      resolve(results);
    }, durationMs);
  });
}

/** Best-effort reverse DNS (PTR) lookup with a hard timeout. */
export async function reverseDns(ip: string, timeoutMs = 2000): Promise<string | undefined> {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      ),
    ]);
    const name = names?.[0];
    return name ? name.replace(/\.$/, '') : undefined;
  } catch {
    return undefined;
  }
}
