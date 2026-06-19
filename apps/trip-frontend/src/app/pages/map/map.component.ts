import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Select } from 'primeng/select';
import * as L from 'leaflet';
import { ApiService } from '../../core/api.service';
import { Activity, Trip } from '../../core/models';
import { resolveColumns } from '../../core/schedule-layout';
import { formatMinutes, zonedParts } from '../../core/tz';

interface ActivityPin {
  lat: number;
  lng: number;
  order: number;
  title: string;
  time: string;
  color: string;
}

interface HotelPin {
  lat: number;
  lng: number;
  city: string;
  label: string;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [FormsModule, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-page">
      <div class="toolbar">
        <button class="back" (click)="back()"><i class="pi pi-arrow-left"></i></button>
        <div class="title">{{ trip()?.name }} · Map</div>
        <div class="spacer"></div>
        <p-select
          [ngModel]="day()"
          (ngModelChange)="day.set($event)"
          [options]="dayOptions()"
          optionLabel="label"
          optionValue="value"
          styleClass="day-select"
          appendTo="body"
        />
      </div>

      <div class="map-wrap">
        <div #mapEl class="map"></div>
        @if (!loading() && pinCount() === 0) {
          <div class="overlay">
            <div class="card hint">
              <i class="pi pi-map-marker"></i>
              <p class="muted">
                No locations to show yet. Add a location to an activity (in the
                schedule) or a hotel location to a stop.
              </p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .map-page { display: flex; flex-direction: column; height: calc(100dvh - var(--header-height)); }
    .toolbar {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg-surface);
    }
    .toolbar .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toolbar .spacer { flex: 1; }
    .back { width: 34px; height: 34px; border: none; border-radius: 9px; background: var(--bg-subtle); cursor: pointer; }
    .map-wrap { position: relative; flex: 1; }
    .map { position: absolute; inset: 0; }
    .overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 500; }
    .hint { max-width: 320px; padding: 20px; text-align: center; pointer-events: auto; }
    .hint i { font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 10px; }
    :host ::ng-deep .day-select { min-width: 170px; }
    :host ::ng-deep .trip-pin {
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg); color: #fff; font-weight: 700; font-size: 12px;
      border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    :host ::ng-deep .trip-pin span { transform: rotate(45deg); }
    :host ::ng-deep .hotel-pin {
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 6px; background: #334155;
      color: #fff; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
  `,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  readonly trip = signal<Trip | null>(null);
  readonly activities = signal<Activity[]>([]);
  readonly loading = signal(true);

  /** Selected day filter: 'all' or a YYYY-MM-DD date. */
  readonly day = signal<string>('all');

  private map?: L.Map;
  private layer?: L.LayerGroup;
  private readonly mapReady = signal(false);

  readonly dayOptions = computed(() => {
    const t = this.trip();
    const opts = [{ label: 'Whole trip', value: 'all' }];
    if (!t) return opts;
    for (const col of resolveColumns(t.segments, t.homeTimezone)) {
      const [, m, d] = col.date.split('-');
      opts.push({
        label: `${m}/${d}${col.city ? ' · ' + col.city : ''}`,
        value: col.date,
      });
    }
    return opts;
  });

  /** Activities with a location, filtered by the day selection, in order. */
  readonly visibleActivities = computed<ActivityPin[]>(() => {
    const t = this.trip();
    if (!t) return [];
    const tz = t.homeTimezone;
    const day = this.day();

    const located = this.activities()
      .filter((a) => a.lat != null && a.lng != null)
      .filter((a) => {
        if (day === 'all') return true;
        const s = zonedParts(new Date(a.startAt), tz).date;
        const e = zonedParts(new Date(a.endAt), tz).date;
        return s <= day && day <= e;
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    return located.map((a, i) => {
      const s = zonedParts(new Date(a.startAt), tz);
      const [, mm, dd] = s.date.split('-');
      return {
        lat: a.lat as number,
        lng: a.lng as number,
        order: i + 1,
        title: a.title,
        time: `${mm}/${dd} ${formatMinutes(s.minutes)}`,
        color: a.color || a.tags[0]?.color || '#4f46e5',
      };
    });
  });

  readonly visibleHotels = computed<HotelPin[]>(() => {
    const t = this.trip();
    if (!t) return [];
    const day = this.day();
    return t.segments
      .filter((s) => s.lat != null && s.lng != null)
      .filter((s) => day === 'all' || (s.startDate <= day && day <= s.endDate))
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        city: s.city,
        label: s.hotelName || s.locationLabel || s.city,
      }));
  });

  readonly pinCount = computed(
    () => this.visibleActivities().length + this.visibleHotels().length
  );

  constructor() {
    this.load();
    // Redraw whenever the map is ready or the visible pins change.
    effect(() => {
      const acts = this.visibleActivities();
      const hotels = this.visibleHotels();
      if (this.mapReady()) this.draw(acts, hotels);
    });
  }

  ngAfterViewInit(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;
    this.map = L.map(el, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.mapReady.set(true);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getTrip(this.id()).subscribe({
      next: (t) => {
        this.trip.set(t);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getActivities(this.id()).subscribe((a) => this.activities.set(a));
  }

  private draw(acts: ActivityPin[], hotels: HotelPin[]): void {
    if (!this.map || !this.layer) return;
    this.layer.clearLayers();

    const latlngs: L.LatLngExpression[] = [];

    for (const h of hotels) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="hotel-pin"><i class="pi pi-home"></i></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([h.lat, h.lng], { icon })
        .bindPopup(`<strong>${this.escape(h.label)}</strong><br/>${this.escape(h.city)}`)
        .addTo(this.layer);
    }

    for (const a of acts) {
      latlngs.push([a.lat, a.lng]);
      const icon = L.divIcon({
        className: '',
        html: `<div class="trip-pin" style="background:${a.color}"><span>${a.order}</span></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 24],
      });
      L.marker([a.lat, a.lng], { icon })
        .bindPopup(
          `<strong>${a.order}. ${this.escape(a.title)}</strong><br/>${this.escape(a.time)}`
        )
        .addTo(this.layer);
    }

    // Connect activities in schedule order.
    if (latlngs.length > 1) {
      L.polyline(latlngs, {
        color: '#4f46e5',
        weight: 3,
        opacity: 0.6,
        dashArray: '6 6',
      }).addTo(this.layer);
    }

    const allPoints: L.LatLngExpression[] = [
      ...latlngs,
      ...hotels.map((h) => [h.lat, h.lng] as L.LatLngExpression),
    ];
    if (allPoints.length === 1) {
      this.map.setView(allPoints[0], 14);
    } else if (allPoints.length > 1) {
      this.map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
    }
  }

  private escape(s: string): string {
    return s.replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
    );
  }

  back(): void {
    void this.router.navigate(['/trips', this.id()]);
  }
}
