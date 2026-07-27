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
