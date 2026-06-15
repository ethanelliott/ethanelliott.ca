import { Injectable, computed, inject, signal } from '@angular/core';
import { SensorApi } from './sensor-api.service';
import { Reading } from './models';
import { PRIMARY_METRIC } from './metrics';

const REFRESH_MS = 30_000;
/** Hours of recent primary-metric history kept for overview sparklines. */
const SPARK_HOURS = 6;

@Injectable({ providedIn: 'root' })
export class SensorStore {
  private readonly api = inject(SensorApi);

  readonly readings = signal<Reading[]>([]);
  readonly loading = signal(true);
  readonly offline = signal(false);
  readonly lastUpdated = signal<number | null>(null);

  /** Ticks every second so "updated Xs ago" stays current. */
  readonly now = signal(Date.now());

  /** Recent primary-metric values per device (chronological) for sparklines. */
  readonly recent = signal<Record<string, number[]>>({});

  /** Which device's detail view is open (null = overview). */
  readonly selectedDeviceId = signal<string | null>(null);

  readonly selectedReading = computed(
    () =>
      this.readings().find((r) => r.device.id === this.selectedDeviceId()) ??
      null
  );

  /** Whole seconds since the last successful refresh. */
  readonly updatedAgo = computed(() => {
    const lu = this.lastUpdated();
    if (lu == null) return null;
    return Math.max(0, Math.round((this.now() - lu) / 1000));
  });

  /** Human label for the freshness indicator. */
  readonly updatedLabel = computed(() => {
    const s = this.updatedAgo();
    if (s == null) return '—';
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  });

  constructor() {
    this.refresh();
    setInterval(() => this.refresh(), REFRESH_MS);
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  refresh(): void {
    this.api.latest().subscribe({
      next: (readings) => {
        this.readings.set(
          [...readings].sort((a, b) =>
            a.device.type.localeCompare(b.device.type)
          )
        );
        this.lastUpdated.set(Date.now());
        this.loading.set(false);
        this.offline.set(false);
        this.loadRecent();
      },
      error: () => {
        this.loading.set(false);
        this.offline.set(true);
      },
    });
  }

  private loadRecent(): void {
    for (const reading of this.readings()) {
      const primary = PRIMARY_METRIC[reading.device.type];
      this.api.series(reading.device.id, primary, SPARK_HOURS, 200).subscribe({
        next: (page) => {
          const values = [...page.points].reverse().map((p) => p.v);
          this.recent.update((m) => ({ ...m, [reading.device.id]: values }));
        },
        error: () => {
          /* leave previous spark data in place */
        },
      });
    }
  }

  open(deviceId: string): void {
    this.selectedDeviceId.set(deviceId);
  }

  close(): void {
    this.selectedDeviceId.set(null);
  }
}
