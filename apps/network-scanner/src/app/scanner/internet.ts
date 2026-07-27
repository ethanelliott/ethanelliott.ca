import { connect } from 'node:net';
import { promises as dns } from 'node:dns';

export interface TargetResult {
  target: string; // "host:port"
  host: string;
  port: number;
  attempts: number;
  successes: number;
  rttMs?: number; // average RTT over successful TCP handshakes
}

/** One TCP-connect probe; resolves handshake time in ms, or null on failure. */
function probeTcp(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok ? Date.now() - started : null);
    };
    const socket = connect({ host, port, timeout: timeoutMs });
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

/**
 * Probe each "host:port" target `attempts` times and report reachability + the
 * average TCP handshake RTT. Uses plain TCP connects (no raw sockets / ICMP),
 * which is a robust "is the internet reachable and how fast" signal.
 */
export async function checkTargets(
  targets: string[],
  attempts: number,
  timeoutMs: number
): Promise<TargetResult[]> {
  return Promise.all(
    targets.map(async (target) => {
      const [host, portStr] = target.split(':');
      const port = Number(portStr) || 443;
      let successes = 0;
      const rtts: number[] = [];
      for (let i = 0; i < attempts; i++) {
        const rtt = await probeTcp(host, port, timeoutMs);
        if (rtt !== null) {
          successes++;
          rtts.push(rtt);
        }
      }
      return {
        target,
        host,
        port,
        attempts,
        successes,
        rttMs: rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : undefined,
      };
    })
  );
}

/** Time a DNS resolution of `host`; resolves seconds, or null on failure. */
export async function resolveTiming(host: string, timeoutMs: number): Promise<number | null> {
  const started = Date.now();
  try {
    await Promise.race([
      dns.lookup(host),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return (Date.now() - started) / 1000;
  } catch {
    return null;
  }
}

// ── Throughput (speed test) ──────────────────────────────────────────────────

// Cloudflare's speed-test edge: __down?bytes=N streams N bytes back, __up
// accepts an arbitrary body. No API key, no binary, served from the nearest CF
// PoP — a clean in-process way to measure real WAN throughput.
const CF_SPEED_URL = 'https://speed.cloudflare.com';

export interface SpeedTestResult {
  downloadMbps: number;
  uploadMbps: number;
  latencyMs?: number; // idle TTFB to the CF edge (min of a few samples)
  bytesDown: number;
  bytesUp: number;
}

export interface SpeedTestOptions {
  downloadBytes: number;
  uploadBytes: number;
  timeoutMs: number;
  latencySamples?: number;
}

/** Min TTFB over a few tiny requests — a rough idle-latency figure to the edge. */
async function measureLatency(samples: number, timeoutMs: number): Promise<number | undefined> {
  const rtts: number[] = [];
  for (let i = 0; i < samples; i++) {
    const started = Date.now();
    try {
      const res = await fetch(`${CF_SPEED_URL}/__down?bytes=0`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      await res.arrayBuffer();
      rtts.push(Date.now() - started);
    } catch {
      /* ignore individual sample failures */
    }
  }
  return rtts.length ? Math.min(...rtts) : undefined;
}

/** Stream `bytes` from the CF edge and return the achieved rate in Mbps. */
async function measureDownload(bytes: number, timeoutMs: number): Promise<number> {
  const started = Date.now();
  const res = await fetch(`${CF_SPEED_URL}/__down?bytes=${bytes}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) received += value.length;
  }
  const elapsedSec = (Date.now() - started) / 1000;
  return elapsedSec > 0 ? (received * 8) / elapsedSec / 1e6 : 0;
}

/** POST `bytes` to the CF edge and return the achieved rate in Mbps. */
async function measureUpload(bytes: number, timeoutMs: number): Promise<number> {
  const payload = Buffer.alloc(bytes);
  const started = Date.now();
  const res = await fetch(`${CF_SPEED_URL}/__up`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${res.statusText}`);
  const elapsedSec = (Date.now() - started) / 1000;
  return elapsedSec > 0 ? (bytes * 8) / elapsedSec / 1e6 : 0;
}

/**
 * Run a full download + upload throughput test against the Cloudflare edge,
 * plus a rough idle-latency reading. Each phase is bounded by `timeoutMs`.
 * Throws if a phase fails so the caller can record an error.
 */
export async function runSpeedTest(opts: SpeedTestOptions): Promise<SpeedTestResult> {
  const latencyMs = await measureLatency(opts.latencySamples ?? 5, Math.min(opts.timeoutMs, 5000));
  const downloadMbps = await measureDownload(opts.downloadBytes, opts.timeoutMs);
  const uploadMbps = await measureUpload(opts.uploadBytes, opts.timeoutMs);
  return {
    downloadMbps,
    uploadMbps,
    latencyMs,
    bytesDown: opts.downloadBytes,
    bytesUp: opts.uploadBytes,
  };
}
