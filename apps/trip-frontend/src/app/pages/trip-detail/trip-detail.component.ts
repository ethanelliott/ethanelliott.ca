import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Segment, SegmentRequest, Trip } from '../../core/models';
import { timezoneOptions } from '../../core/timezones';
import { formatDate, formatDateRange } from '../../core/format';

interface SegmentForm extends SegmentRequest {
  id: string | null;
}

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [
    FormsModule,
    Button,
    Dialog,
    InputText,
    Select,
    Textarea,
    ConfirmDialog,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="page">
      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (trip(); as t) {
        <!-- Header -->
        <div class="trip-head">
          <button class="back" (click)="back()">
            <i class="pi pi-arrow-left"></i>
          </button>
          <div class="head-text">
            <h1>{{ t.name }}</h1>
            <p class="muted">{{ rangeLabel() }} · {{ t.baseCurrency }}</p>
          </div>
          <p-button
            label="Schedule"
            icon="pi pi-calendar"
            size="small"
            (onClick)="openSchedule()"
          />
          <p-button
            icon="pi pi-pencil"
            severity="secondary"
            [text]="true"
            (onClick)="openEditTrip()"
          />
          @if (isOwner()) {
            <p-button
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              (onClick)="confirmDeleteTrip()"
            />
          }
        </div>

        @if (t.description) {
          <p class="desc">{{ t.description }}</p>
        }

        <!-- Segments -->
        <div class="section-row">
          <h2 class="section-title">Itinerary</h2>
          <p-button
            label="Add stop"
            icon="pi pi-plus"
            size="small"
            (onClick)="openCreateSegment()"
          />
        </div>

        @if (t.segments.length === 0) {
          <div class="empty-state card">
            <i class="pi pi-map-marker"></i>
            <p class="muted">No stops yet. Add the first city you'll visit.</p>
          </div>
        } @else {
          <div class="segment-list">
            @for (s of t.segments; track s.id; let i = $index) {
              <div class="segment card">
                <div
                  class="swatch"
                  [style.background]="s.color || 'var(--brand)'"
                ></div>
                <div class="segment-main">
                  <div class="segment-city">
                    {{ s.city }}@if (s.country) {<span class="muted">, {{ s.country }}</span>}
                  </div>
                  <div class="segment-sub muted">
                    {{ formatDateRange(s.startDate, s.endDate) }}
                    @if (s.hotelName) { · {{ s.hotelName }} }
                  </div>
                  <div class="segment-tz muted">
                    <i class="pi pi-clock"></i> {{ s.timezone }}
                  </div>
                </div>
                <div class="segment-actions">
                  <button
                    class="icon-btn"
                    [disabled]="i === 0"
                    (click)="move(i, -1)"
                    title="Move up"
                  >
                    <i class="pi pi-chevron-up"></i>
                  </button>
                  <button
                    class="icon-btn"
                    [disabled]="i === t.segments.length - 1"
                    (click)="move(i, 1)"
                    title="Move down"
                  >
                    <i class="pi pi-chevron-down"></i>
                  </button>
                  <button class="icon-btn" (click)="openEditSegment(s)">
                    <i class="pi pi-pencil"></i>
                  </button>
                  <button class="icon-btn danger" (click)="confirmDeleteSegment(s)">
                    <i class="pi pi-trash"></i>
                  </button>
                </div>
              </div>
            }
          </div>
        }

        <!-- Members -->
        <div class="section-row">
          <h2 class="section-title">Travellers</h2>
        </div>
        <div class="card members">
          @for (m of t.members; track m.id) {
            <div class="member">
              <div class="avatar">{{ initial(m.user.name) }}</div>
              <div class="member-text">
                <div class="member-name">
                  {{ m.user.name }}
                  @if (m.role === 'owner') {
                    <span class="role-chip">owner</span>
                  }
                </div>
                <div class="member-username muted">{{ '@' + m.user.username }}</div>
              </div>
              @if (canRemove(m.role, m.user.id)) {
                <button class="icon-btn danger" (click)="removeMember(m.user.id)">
                  <i class="pi pi-times"></i>
                </button>
              }
            </div>
          }

          <div class="add-member">
            <input
              pInputText
              placeholder="Add by username"
              [(ngModel)]="memberUsername"
              (keyup.enter)="addMember()"
              autocapitalize="none"
            />
            <p-button
              icon="pi pi-user-plus"
              [loading]="addingMember()"
              (onClick)="addMember()"
            />
          </div>
        </div>
      } @else {
        <div class="empty-state card">
          <i class="pi pi-exclamation-triangle"></i>
          <p class="muted">Trip not found, or you don't have access.</p>
        </div>
      }
    </div>

    <!-- Edit trip dialog -->
    <p-dialog
      [(visible)]="editTripVisible"
      [modal]="true"
      [draggable]="false"
      header="Edit trip"
      [style]="{ width: '460px' }"
    >
      <div class="form">
        <div class="field">
          <label>Name</label>
          <input pInputText [(ngModel)]="tripForm.name" />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea pTextarea rows="2" [(ngModel)]="tripForm.description"></textarea>
        </div>
        <div class="field">
          <label>Home timezone</label>
          <p-select
            [options]="tzOptions"
            [(ngModel)]="tripForm.homeTimezone"
            [filter]="true"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        <div class="field">
          <label>Base currency</label>
          <input pInputText [(ngModel)]="tripForm.baseCurrency" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editTripVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="savingTrip()" (onClick)="saveTrip()" />
      </ng-template>
    </p-dialog>

    <!-- Segment dialog -->
    <p-dialog
      [(visible)]="segmentVisible"
      [modal]="true"
      [draggable]="false"
      [header]="segmentForm.id ? 'Edit stop' : 'Add stop'"
      [style]="{ width: '460px' }"
    >
      <div class="form">
        <div class="field">
          <label>City</label>
          <input pInputText [(ngModel)]="segmentForm.city" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Country</label>
            <input pInputText [(ngModel)]="segmentForm.country" />
          </div>
          <div class="field swatch-field">
            <label>Colour</label>
            <input type="color" [(ngModel)]="segmentForm.color" />
          </div>
        </div>
        <div class="field">
          <label>Hotel</label>
          <input pInputText [(ngModel)]="segmentForm.hotelName" />
        </div>
        <div class="field">
          <label>Timezone</label>
          <p-select
            [options]="tzOptions"
            [(ngModel)]="segmentForm.timezone"
            [filter]="true"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Start date</label>
            <input type="date" [(ngModel)]="segmentForm.startDate" />
          </div>
          <div class="field">
            <label>End date</label>
            <input type="date" [(ngModel)]="segmentForm.endDate" />
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="segmentVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="savingSegment()" (onClick)="saveSegment()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .trip-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .back {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 10px;
      background: var(--bg-subtle);
      cursor: pointer;
      flex-shrink: 0;
    }
    .head-text {
      flex: 1;
      min-width: 0;
    }
    .head-text h1 {
      font-size: 22px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .head-text .muted {
      font-size: 13px;
    }
    .desc {
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .section-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 18px;
    }
    .section-row .section-title {
      margin: 0;
    }
    .segment-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
    .segment {
      display: flex;
      align-items: stretch;
      padding: 0;
      overflow: hidden;
    }
    .swatch {
      width: 6px;
      flex-shrink: 0;
    }
    .segment-main {
      flex: 1;
      padding: 12px 14px;
      min-width: 0;
    }
    .segment-city {
      font-weight: 600;
    }
    .segment-sub,
    .segment-tz {
      font-size: 13px;
    }
    .segment-tz i {
      font-size: 11px;
      margin-right: 4px;
    }
    .segment-actions {
      display: flex;
      align-items: center;
      padding-right: 8px;
      gap: 2px;
    }
    .icon-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-secondary);
    }
    .icon-btn:hover:not(:disabled) {
      background: var(--bg-subtle);
    }
    .icon-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .icon-btn.danger {
      color: var(--owe, #e8643c);
    }
    .members {
      padding: 8px;
      margin-top: 8px;
    }
    .member {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--brand-light);
      color: var(--brand);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      flex-shrink: 0;
    }
    .member-text {
      flex: 1;
    }
    .member-name {
      font-weight: 600;
    }
    .member-username {
      font-size: 13px;
    }
    .role-chip {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--brand-light);
      color: var(--brand);
      padding: 2px 6px;
      border-radius: 6px;
      margin-left: 6px;
    }
    .add-member {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-top: 1px solid var(--border);
      margin-top: 4px;
      input {
        flex: 1;
      }
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
      input[type='date'] {
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font: inherit;
      }
    }
    .field-row {
      display: flex;
      gap: 12px;
    }
    .field-row .field {
      flex: 1;
    }
    .swatch-field {
      flex: 0 0 64px;
      input[type='color'] {
        width: 100%;
        height: 40px;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: none;
        cursor: pointer;
      }
    }
    :host ::ng-deep .w-full {
      width: 100%;
    }
  `,
})
export class TripDetailComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  readonly trip = signal<Trip | null>(null);
  readonly loading = signal(true);

  readonly tzOptions = timezoneOptions();
  readonly formatDate = formatDate;
  readonly formatDateRange = formatDateRange;

  // Edit-trip dialog state
  readonly editTripVisible = signal(false);
  readonly savingTrip = signal(false);
  tripForm = { name: '', description: '', homeTimezone: '', baseCurrency: '' };

  // Segment dialog state
  readonly segmentVisible = signal(false);
  readonly savingSegment = signal(false);
  segmentForm: SegmentForm = this.blankSegment();

  // Member state
  memberUsername = '';
  readonly addingMember = signal(false);

  readonly rangeLabel = computed(() => {
    const segments = this.trip()?.segments ?? [];
    if (segments.length === 0) return 'No dates yet';
    const start = segments.reduce(
      (min, s) => (s.startDate < min ? s.startDate : min),
      segments[0].startDate
    );
    const end = segments.reduce(
      (max, s) => (s.endDate > max ? s.endDate : max),
      segments[0].endDate
    );
    return formatDateRange(start, end);
  });

  readonly myMembership = computed(() => {
    const me = this.auth.profile()?.id;
    return this.trip()?.members.find((m) => m.user.id === me) ?? null;
  });

  readonly isOwner = computed(() => this.myMembership()?.role === 'owner');

  constructor() {
    void this.auth.loadProfile();
    // `id` is set synchronously by the router input binding before this runs.
    this.load();
  }

  private blankSegment(): SegmentForm {
    return {
      id: null,
      city: '',
      country: '',
      hotelName: '',
      timezone: this.trip()?.homeTimezone || 'UTC',
      startDate: '',
      endDate: '',
      color: '#4f46e5',
    };
  }

  private load(): void {
    this.loading.set(true);
    this.api.getTrip(this.id()).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        this.loading.set(false);
      },
      error: () => {
        this.trip.set(null);
        this.loading.set(false);
      },
    });
  }

  back(): void {
    void this.router.navigate(['/trips']);
  }

  openSchedule(): void {
    void this.router.navigate(['/trips', this.id(), 'schedule']);
  }

  initial(name: string): string {
    return (name?.trim()?.[0] || '?').toUpperCase();
  }

  canRemove(role: string, memberUserId: string): boolean {
    const me = this.auth.profile()?.id;
    if (role === 'owner') return false;
    return this.isOwner() || memberUserId === me;
  }

  // ── Trip edit ──
  openEditTrip(): void {
    const t = this.trip();
    if (!t) return;
    this.tripForm = {
      name: t.name,
      description: t.description ?? '',
      homeTimezone: t.homeTimezone,
      baseCurrency: t.baseCurrency,
    };
    this.editTripVisible.set(true);
  }

  saveTrip(): void {
    const name = this.tripForm.name.trim();
    if (!name) return;
    this.savingTrip.set(true);
    this.api
      .updateTrip(this.id(), {
        name,
        description: this.tripForm.description.trim() || undefined,
        homeTimezone: this.tripForm.homeTimezone,
        baseCurrency: this.tripForm.baseCurrency.trim() || 'CAD',
      })
      .subscribe({
        next: (trip) => {
          this.trip.set(trip);
          this.savingTrip.set(false);
          this.editTripVisible.set(false);
        },
        error: (e) => {
          this.savingTrip.set(false);
          this.error(e);
        },
      });
  }

  confirmDeleteTrip(): void {
    this.confirm.confirm({
      header: 'Delete trip',
      message: 'This permanently deletes the trip for everyone. Continue?',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteTrip(this.id()).subscribe({
          next: () => this.router.navigate(['/trips']),
          error: (e) => this.error(e),
        });
      },
    });
  }

  // ── Segments ──
  openCreateSegment(): void {
    this.segmentForm = this.blankSegment();
    this.segmentVisible.set(true);
  }

  openEditSegment(s: Segment): void {
    this.segmentForm = {
      id: s.id,
      city: s.city,
      country: s.country ?? '',
      hotelName: s.hotelName ?? '',
      timezone: s.timezone,
      startDate: s.startDate,
      endDate: s.endDate,
      color: s.color ?? '#4f46e5',
    };
    this.segmentVisible.set(true);
  }

  saveSegment(): void {
    const f = this.segmentForm;
    if (!f.city.trim() || !f.startDate || !f.endDate) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing details',
        detail: 'City, start date and end date are required.',
      });
      return;
    }
    if (f.startDate > f.endDate) {
      this.messages.add({
        severity: 'warn',
        summary: 'Invalid dates',
        detail: 'The start date must be on or before the end date.',
      });
      return;
    }

    const body: SegmentRequest = {
      city: f.city.trim(),
      country: f.country?.trim() || undefined,
      hotelName: f.hotelName?.trim() || undefined,
      timezone: f.timezone,
      startDate: f.startDate,
      endDate: f.endDate,
      color: f.color || undefined,
    };

    this.savingSegment.set(true);
    const req = f.id
      ? this.api.updateSegment(this.id(), f.id, body)
      : this.api.createSegment(this.id(), body);

    req.subscribe({
      next: () => {
        this.savingSegment.set(false);
        this.segmentVisible.set(false);
        this.load();
      },
      error: (e) => {
        this.savingSegment.set(false);
        this.error(e);
      },
    });
  }

  confirmDeleteSegment(s: Segment): void {
    this.confirm.confirm({
      header: 'Delete stop',
      message: `Remove ${s.city} from the itinerary?`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteSegment(this.id(), s.id).subscribe({
          next: () => this.load(),
          error: (e) => this.error(e),
        });
      },
    });
  }

  move(index: number, delta: number): void {
    const t = this.trip();
    if (!t) return;
    const ids = t.segments.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];

    this.api.reorderSegments(this.id(), ids).subscribe({
      next: (segments) =>
        this.trip.set(this.trip() ? { ...this.trip()!, segments } : null),
      error: (e) => this.error(e),
    });
  }

  // ── Members ──
  addMember(): void {
    const username = this.memberUsername.trim();
    if (!username) return;
    this.addingMember.set(true);
    this.api.addMember(this.id(), username).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        this.memberUsername = '';
        this.addingMember.set(false);
      },
      error: (e) => {
        this.addingMember.set(false);
        this.error(e);
      },
    });
  }

  removeMember(userId: string): void {
    this.api.removeMember(this.id(), userId).subscribe({
      next: (trip) => this.trip.set(trip),
      error: (e) => this.error(e),
    });
  }

  private error(e: any): void {
    this.messages.add({
      severity: 'error',
      summary: 'Something went wrong',
      detail: e?.error?.message || e?.message || 'Please try again.',
    });
  }
}
