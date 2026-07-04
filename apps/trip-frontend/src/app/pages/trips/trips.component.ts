import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { TripSummary } from '../../core/models';
import { timezoneOptions } from '../../core/timezones';
import { formatDateRange } from '../../core/format';

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from calendar date `a` to `b` (b - a), DST-safe via UTC. */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, Select, Textarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1 class="title">Trips</h1>
        <p-button
          label="New trip"
          icon="pi pi-plus"
          (onClick)="openCreate()"
        />
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (trips().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-map"></i>
          <p class="headline">No trips yet</p>
          <p class="muted">Create your first trip to start planning.</p>
        </div>
      } @else {
        @if (upcoming().length > 0) {
          <div class="section-title">Upcoming</div>
          <div class="trip-grid">
            @for (trip of upcoming(); track trip.id) {
              <button class="trip-card card" (click)="open(trip.id)">
                @if (chip(trip); as c) {
                  <span class="chip" [class]="'chip-' + c.state">{{ c.label }}</span>
                }
                <div class="trip-name">{{ trip.name }}</div>
                <div class="trip-dates muted">
                  {{ formatDateRange(trip.startDate, trip.endDate) }}
                </div>
                <div class="trip-meta">
                  <span><i class="pi pi-users"></i> {{ trip.memberCount }}</span>
                  <span><i class="pi pi-map-marker"></i> {{ trip.segmentCount }}</span>
                  <span class="currency">{{ trip.baseCurrency }}</span>
                </div>
              </button>
            }
          </div>
        }
        @if (past().length > 0) {
          <div class="section-title">Past</div>
          <div class="trip-grid past">
            @for (trip of past(); track trip.id) {
              <button class="trip-card card" (click)="open(trip.id)">
                <div class="trip-name">{{ trip.name }}</div>
                <div class="trip-dates muted">
                  {{ formatDateRange(trip.startDate, trip.endDate) }}
                </div>
                <div class="trip-meta">
                  <span><i class="pi pi-users"></i> {{ trip.memberCount }}</span>
                  <span><i class="pi pi-map-marker"></i> {{ trip.segmentCount }}</span>
                  <span class="currency">{{ trip.baseCurrency }}</span>
                </div>
              </button>
            }
          </div>
        }
      }
    </div>

    <p-dialog
      [(visible)]="createVisible"
      [modal]="true"
      [draggable]="false"
      header="New trip"
      [style]="{ width: 'min(460px, 92vw)' }"
    >
      <div class="form">
        <div class="field">
          <label for="name">Name</label>
          <input pInputText id="name" [(ngModel)]="form.name" />
        </div>
        <div class="field">
          <label for="desc">Description</label>
          <textarea
            pTextarea
            id="desc"
            rows="2"
            [(ngModel)]="form.description"
          ></textarea>
        </div>
        <div class="field">
          <label for="tz">Home timezone</label>
          <p-select
            inputId="tz"
            [options]="tzOptions"
            [(ngModel)]="form.homeTimezone"
            [filter]="true"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        <div class="field">
          <label for="cur">Base currency</label>
          <input pInputText id="cur" [(ngModel)]="form.baseCurrency" />
        </div>
      </div>

      <ng-template #footer>
        <p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          (onClick)="createVisible.set(false)"
        />
        <p-button
          label="Create"
          icon="pi pi-check"
          [loading]="saving()"
          (onClick)="create()"
        />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .title {
      font-size: 22px;
    }
    .empty-state .headline {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .trip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .trip-grid + .section-title,
    .section-title + .trip-grid {
      margin-top: 8px;
    }
    .trip-grid.past .trip-card {
      opacity: 0.72;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    .chip-before { background: var(--brand-light); color: var(--brand); }
    .chip-during { background: var(--success-bg); color: var(--success); }
    .trip-card {
      text-align: left;
      padding: 16px;
      cursor: pointer;
      background: var(--bg-surface);
      transition: box-shadow 0.15s;
    }
    .trip-card:hover {
      box-shadow: var(--shadow-md);
    }
    .trip-name {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .trip-dates {
      font-size: 13px;
      margin-bottom: 10px;
    }
    .trip-meta {
      display: flex;
      gap: 14px;
      font-size: 13px;
      color: var(--text-secondary);
      align-items: center;
      i {
        margin-right: 4px;
      }
    }
    .trip-meta .currency {
      margin-left: auto;
      font-weight: 600;
      color: var(--brand);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      label {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      input,
      textarea {
        width: 100%;
      }
    }
    :host ::ng-deep .w-full {
      width: 100%;
    }
  `,
})
export class TripsComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  readonly trips = signal<TripSummary[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly createVisible = signal(false);

  readonly tzOptions = timezoneOptions();
  readonly formatDateRange = formatDateRange;

  private readonly today = todayStr();

  /** Trips that haven't ended yet (or have no dates), soonest first. */
  readonly upcoming = computed(() =>
    this.trips()
      .filter((t) => !t.endDate || t.endDate >= this.today)
      .sort((a, b) =>
        (a.startDate ?? '9999-99-99').localeCompare(b.startDate ?? '9999-99-99')
      )
  );

  /** Finished trips, most recent first. */
  readonly past = computed(() =>
    this.trips()
      .filter((t) => !!t.endDate && t.endDate < this.today)
      .sort((a, b) => b.endDate!.localeCompare(a.endDate!))
  );

  /** Countdown chip for an upcoming/in-progress trip. */
  chip(t: TripSummary): { state: 'before' | 'during'; label: string } | null {
    if (!t.startDate || !t.endDate) return null;
    if (this.today < t.startDate) {
      const n = dayDiff(this.today, t.startDate);
      return { state: 'before', label: n === 1 ? 'Tomorrow' : `In ${n} days` };
    }
    if (this.today > t.endDate) return null;
    return { state: 'during', label: `Day ${dayDiff(t.startDate, this.today) + 1}` };
  }

  form = this.blankForm();

  constructor() {
    this.load();
  }

  private blankForm() {
    return {
      name: '',
      description: '',
      homeTimezone: 'America/Toronto',
      baseCurrency: 'CAD',
    };
  }

  private load(): void {
    this.loading.set(true);
    this.api.getTrips().subscribe({
      next: (trips) => {
        this.trips.set(trips);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(id: string): void {
    void this.router.navigate(['/trips', id]);
  }

  openCreate(): void {
    this.form = this.blankForm();
    this.createVisible.set(true);
  }

  create(): void {
    const name = this.form.name.trim();
    if (!name) {
      this.messages.add({
        severity: 'warn',
        summary: 'Name required',
        detail: 'Give your trip a name.',
      });
      return;
    }

    this.saving.set(true);
    this.api
      .createTrip({
        name,
        description: this.form.description.trim() || undefined,
        homeTimezone: this.form.homeTimezone,
        baseCurrency: this.form.baseCurrency.trim() || 'CAD',
      })
      .subscribe({
        next: (trip) => {
          this.saving.set(false);
          this.createVisible.set(false);
          void this.router.navigate(['/trips', trip.id]);
        },
        error: (error) => {
          this.saving.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'Could not create trip',
            detail: error?.error?.message || 'Please try again.',
          });
        },
      });
  }
}
