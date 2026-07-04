import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import {
  Activity,
  Expense,
  LegendCategory,
  PackingList,
  Tag,
  Trip,
} from './models';

export type LoadState = 'empty' | 'loading' | 'loaded' | 'error';

/**
 * Shared per-trip cache. Every trip tab (overview / schedule / map / budget /
 * packing) reads from these signals instead of refetching on navigation:
 * cached data renders instantly and a background revalidation keeps it fresh
 * (stale-while-revalidate). Mutations either patch the signals directly from
 * the API response or force-reload the affected slice.
 */
@Injectable({ providedIn: 'root' })
export class TripStore {
  private readonly api = inject(ApiService);

  private readonly tripId = signal<string | null>(null);
  private readonly inflight = new Map<string, Promise<void>>();

  readonly trip = signal<Trip | null>(null);
  readonly tripStatus = signal<LoadState>('empty');

  readonly activities = signal<Activity[]>([]);
  readonly activitiesStatus = signal<LoadState>('empty');

  readonly expenses = signal<Expense[]>([]);
  readonly expensesStatus = signal<LoadState>('empty');

  readonly tags = signal<Tag[]>([]);
  readonly tagsStatus = signal<LoadState>('empty');

  readonly legend = signal<LegendCategory[]>([]);
  readonly legendStatus = signal<LoadState>('empty');

  readonly packing = signal<PackingList | null>(null);
  readonly packingStatus = signal<LoadState>('empty');

  /** Point the store at a trip; switching trips clears the previous cache. */
  setActive(tripId: string): void {
    if (this.tripId() === tripId) return;
    this.tripId.set(tripId);
    this.inflight.clear();
    this.trip.set(null);
    this.tripStatus.set('empty');
    this.activities.set([]);
    this.activitiesStatus.set('empty');
    this.expenses.set([]);
    this.expensesStatus.set('empty');
    this.tags.set([]);
    this.tagsStatus.set('empty');
    this.legend.set([]);
    this.legendStatus.set('empty');
    this.packing.set(null);
    this.packingStatus.set('empty');
  }

  id(): string {
    return this.tripId() ?? '';
  }

  loadTrip(force = false): Promise<void> {
    return this.load('trip', this.tripStatus, (id) => this.api.getTrip(id), (t) => this.trip.set(t), force);
  }

  loadActivities(force = false): Promise<void> {
    return this.load('activities', this.activitiesStatus, (id) => this.api.getActivities(id), (a) => this.activities.set(a), force);
  }

  loadExpenses(force = false): Promise<void> {
    return this.load('expenses', this.expensesStatus, (id) => this.api.getExpenses(id), (e) => this.expenses.set(e), force);
  }

  loadTags(force = false): Promise<void> {
    return this.load('tags', this.tagsStatus, (id) => this.api.getTags(id), (t) => this.tags.set(t), force);
  }

  loadLegend(force = false): Promise<void> {
    return this.load('legend', this.legendStatus, (id) => this.api.getLegend(id), (l) => this.legend.set(l), force);
  }

  loadPacking(force = false): Promise<void> {
    return this.load('packing', this.packingStatus, (id) => this.api.getPackingList(id), (p) => this.packing.set(p), force);
  }

  // ── Local patches (applied from API responses after mutations) ──

  upsertActivity(activity: Activity): void {
    const list = this.activities();
    const idx = list.findIndex((a) => a.id === activity.id);
    const next =
      idx >= 0
        ? list.map((a) => (a.id === activity.id ? activity : a))
        : [...list, activity];
    next.sort((a, b) => a.startAt.localeCompare(b.startAt));
    this.activities.set(next);
  }

  removeActivity(activityId: string): void {
    this.activities.set(this.activities().filter((a) => a.id !== activityId));
  }

  private load<T>(
    key: string,
    status: WritableSignal<LoadState>,
    fetcher: (tripId: string) => Observable<T>,
    apply: (value: T) => void,
    force: boolean
  ): Promise<void> {
    const id = this.tripId();
    if (!id) return Promise.resolve();

    const cacheKey = `${key}:${id}`;
    const running = this.inflight.get(cacheKey);
    if (running && !force) return running;

    const cached = status() === 'loaded';
    if (!cached) status.set('loading');

    const request = firstValueFrom(fetcher(id))
      .then((value) => {
        // Ignore responses that arrive after the store moved to another trip.
        if (this.tripId() !== id) return;
        apply(value);
        status.set('loaded');
      })
      .catch(() => {
        if (this.tripId() === id && !cached) status.set('error');
      })
      .finally(() => {
        if (this.inflight.get(cacheKey) === request) {
          this.inflight.delete(cacheKey);
        }
      });
    this.inflight.set(cacheKey, request);

    // Cached: resolve immediately (render stale data) while the fetch above
    // revalidates in the background.
    return cached && !force ? Promise.resolve() : request;
  }
}
