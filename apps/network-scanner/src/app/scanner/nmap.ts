import { spawn } from 'node:child_process';

export interface DiscoveredHost {
  ip: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  rttMs?: number;
}

export interface OpenPort {
  port: number;
  protocol: string;
  service?: string;
  product?: string; // e.g. "OpenSSH" (only with -sV service detection)
  version?: string; // e.g. "9.6p1"
}

export interface HostPorts {
  ip: string;
  ports: OpenPort[];
}

/**
 * Run nmap with the given args and resolve its stdout. nmap is always invoked
 * with `-oX -` so we parse structured XML rather than fragile human output.
 */
function runNmap(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('nmap', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`nmap timed out after ${timeoutMs}ms: nmap ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // nmap can exit non-zero while still producing a valid run (e.g. some
      // hosts unreachable); trust the XML if the run element is present.
      if (stdout.includes('<nmaprun')) {
        resolve(stdout);
      } else {
        reject(new Error(`nmap exited ${code}: ${stderr.trim() || 'no output'}`));
      }
    });
  });
}

/** Pull an attribute value out of an XML opening tag fragment. */
function attr(fragment: string, name: string): string | undefined {
  const m = fragment.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Split an nmap XML document into its individual <host>…</host> blocks. */
function hostBlocks(xml: string): string[] {
  return xml.match(/<host\b[\s\S]*?<\/host>/g) ?? [];
}

/**
 * Ping/ARP discovery scan (`nmap -sn`) of a CIDR/target. Returns one entry per
 * host reported up, with MAC + vendor (from ARP) and RTT when available.
 */
export async function discover(target: string, timeoutMs: number): Promise<DiscoveredHost[]> {
  const xml = await runNmap(['-sn', '-n', '-oX', '-', ...target.split(/\s+/)], timeoutMs);
  const hosts: DiscoveredHost[] = [];

  for (const block of hostBlocks(xml)) {
    const statusTag = block.match(/<status\b[^>]*>/)?.[0] ?? '';
    if (attr(statusTag, 'state') !== 'up') continue;

    const host: DiscoveredHost = { ip: '' };
    for (const addr of block.match(/<address\b[^>]*>/g) ?? []) {
      const type = attr(addr, 'addrtype');
      if (type === 'ipv4') host.ip = attr(addr, 'addr') ?? host.ip;
      else if (type === 'mac') {
        host.mac = normalizeMac(attr(addr, 'addr'));
        host.vendor = attr(addr, 'vendor');
      }
    }

    const hostnameTag = block.match(/<hostname\b[^>]*>/)?.[0];
    if (hostnameTag) host.hostname = attr(hostnameTag, 'name');

    const timesTag = block.match(/<times\b[^>]*>/)?.[0];
    const srtt = timesTag ? attr(timesTag, 'srtt') : undefined;
    if (srtt) host.rttMs = Number(srtt) / 1000; // srtt is microseconds

    if (host.ip) hosts.push(host);
  }
  return hosts;
}

/**
 * TCP port scan of the given IPs. Uses SYN scan (`-sS`, needs CAP_NET_RAW) and
 * `--open` so only open ports are reported. Ports/timing are caller-controlled.
 * When `serviceDetection` is set, adds `-sV` to identify the product/version on
 * each open port (probes only open ports, so the extra cost scales with those).
 */
export async function scanPorts(
  ips: string[],
  ports: string,
  timing: string,
  minRate: number,
  timeoutMs: number,
  serviceDetection = false
): Promise<HostPorts[]> {
  if (ips.length === 0) return [];
  const args = ['-sS', '-n', '--open', timing, `--min-rate=${minRate}`, '-p', ports];
  if (serviceDetection) args.push('-sV', '--version-intensity', '2');
  args.push('-oX', '-', ...ips);
  const xml = await runNmap(args, timeoutMs);

  const results: HostPorts[] = [];
  for (const block of hostBlocks(xml)) {
    let ip = '';
    for (const addr of block.match(/<address\b[^>]*>/g) ?? []) {
      if (attr(addr, 'addrtype') === 'ipv4') ip = attr(addr, 'addr') ?? '';
    }
    if (!ip) continue;

    const openPorts: OpenPort[] = [];
    for (const portBlock of block.match(/<port\b[\s\S]*?<\/port>/g) ?? []) {
      const stateTag = portBlock.match(/<state\b[^>]*>/)?.[0] ?? '';
      if (attr(stateTag, 'state') !== 'open') continue;
      const portTag = portBlock.match(/<port\b[^>]*>/)?.[0] ?? '';
      const serviceTag = portBlock.match(/<service\b[^>]*>/)?.[0];
      openPorts.push({
        port: Number(attr(portTag, 'portid')),
        protocol: attr(portTag, 'protocol') ?? 'tcp',
        service: serviceTag ? attr(serviceTag, 'name') : undefined,
        product: serviceTag ? attr(serviceTag, 'product') : undefined,
        version: serviceTag ? attr(serviceTag, 'version') : undefined,
      });
    }
    results.push({ ip, ports: openPorts });
  }
  return results;
}

/** Normalize a MAC to lowercase colon-separated form. */
export function normalizeMac(mac?: string): string | undefined {
  if (!mac) return undefined;
  return mac.toLowerCase();
}
