import { inject } from '@ee/di';
import { Database } from '../data-source';
import { IpRecordEntity } from './ip.entity';

const DEFAULT_CHECK_URL = 'https://link-ip.nextdns.io/f77259/6c421d78ad6b9e97';
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class IpService {
  private readonly _db = inject(Database);
  private readonly _repo = this._db.repositoryFor(IpRecordEntity);
  private _timer: ReturnType<typeof setInterval> | null = null;

  private get _checkUrl(): string {
    return process.env.IP_CHECK_URL || DEFAULT_CHECK_URL;
  }

  private get _ntfyUrl(): string {
    return process.env.NTFY_URL || 'http://ntfy.elliott.haus';
  }

  private get _ntfyTopic(): string {
    return process.env.NTFY_TOPIC || 'ip-monitor';
  }

  private get _intervalMs(): number {
    const envMinutes = process.env.CHECK_INTERVAL_MINUTES;
    if (envMinutes) {
      return parseInt(envMinutes, 10) * 60 * 1000;
    }
    return DEFAULT_CHECK_INTERVAL_MS;
  }

  /**
   * Start the periodic IP check loop.
   */
  async start(): Promise<void> {
    console.log(
      `🌐 IP Monitor starting — checking every ${
        this._intervalMs / 60000
      } minutes`
    );
    console.log(`🔗 Check URL: ${this._checkUrl}`);
    console.log(`📢 Notifications → ${this._ntfyUrl}/${this._ntfyTopic}`);

    // Run an initial check immediately
    await this.check();

    // Schedule periodic checks
    this._timer = setInterval(() => {
      this.check().catch((err) =>
        console.error('❌ Scheduled IP check failed:', err)
      );
    }, this._intervalMs);
  }

  /**
   * Stop the periodic check loop.
   */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      console.log('🛑 IP Monitor stopped');
    }
  }

  /**
   * Perform a single IP check: fetch the current IP, compare with the last
   * known IP, store the result, and notify if changed.
   */
  async check(): Promise<IpRecordEntity> {
    const currentIp = await this._fetchIp();
    const lastRecord = await this._getLastRecord();
    const previousIp = lastRecord?.ip ?? null;
    const changed = previousIp !== null && previousIp !== currentIp;

    const record = this._repo.create({
      ip: currentIp,
      changed,
      previousIp,
    });
    await this._repo.save(record);

    if (changed) {
      console.log(`⚠️  IP changed: ${previousIp} → ${currentIp}`);
      await this._notify(currentIp, previousIp!);
    } else {
      console.log(`✅ IP unchanged: ${currentIp}`);
    }

    return record;
  }

  /**
   * Return the most recent IP records.
   */
  async getHistory(limit = 50): Promise<IpRecordEntity[]> {
    return this._repo.find({
      order: { checkedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Return the latest IP record, or null if none yet.
   */
  async getCurrent(): Promise<IpRecordEntity | null> {
    return this._repo.findOne({
      where: {},
      order: { checkedAt: 'DESC' },
    });
  }

  // ── private helpers ──────────────────────────────────────────────

  private async _fetchIp(): Promise<string> {
    const res = await fetch(this._checkUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`IP check failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    // The NextDNS link-ip endpoint returns the IP as plain text.
    // Trim whitespace / newlines just in case.
    return text.trim();
  }

  private async _getLastRecord(): Promise<IpRecordEntity | null> {
    return this._repo.findOne({
      where: {},
      order: { checkedAt: 'DESC' },
    });
  }

  private async _notify(newIp: string, previousIp: string): Promise<void> {
    try {
      const url = `${this._ntfyUrl}/${this._ntfyTopic}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Title: 'IP Address Changed',
          Priority: 'high',
          Tags: 'warning,globe_with_meridians',
        },
        body: `Your public IP has changed.\n\nOld: ${previousIp}\nNew: ${newIp}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.error(
          `❌ ntfy notification failed: ${res.status} ${res.statusText}`
        );
      } else {
        console.log('📢 Notification sent via ntfy');
      }
    } catch (err) {
      console.error('❌ Failed to send ntfy notification:', err);
    }
  }
}
