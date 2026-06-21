import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
import { LocationSearchComponent } from '../../shared/location-search.component';
import {
  Activity,
  Expense,
  LatLng,
  Segment,
  SegmentRequest,
  Stay,
  StayRequest,
  Trip,
} from '../../core/models';
import { timezoneOptions } from '../../core/timezones';
import { formatDate, formatDateRange, formatMoney } from '../../core/format';

interface SegmentForm extends SegmentRequest {
  id: string | null;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
}

interface StayForm extends StayRequest {
  id: string | null;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
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
    LocationSearchComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="page">
      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (trip(); as t) {
        <!-- Hero -->
        <div class="hero card">
          <div class="hero-top">
            <div class="hero-text">
              <h1>{{ t.name }}</h1>
              <p class="hero-sub muted">{{ rangeLabel() }} · {{ t.baseCurrency }}</p>
            </div>
            <div class="hero-actions">
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
          </div>
          @if (countdown(); as c) {
            <div class="countdown" [class]="'cd-' + c.state">
              <i class="pi" [class.pi-clock]="c.state !== 'during'" [class.pi-play-circle]="c.state === 'during'"></i>
              {{ c.label }}
            </div>
          }
          @if (t.description) {
            <p class="desc">{{ t.description }}</p>
          }
        </div>

        <!-- Stats -->
        <div class="stats">
          <div class="stat"><div class="stat-val">{{ dayCount() }}</div><div class="stat-lbl">Days</div></div>
          <div class="stat"><div class="stat-val">{{ t.segments.length }}</div><div class="stat-lbl">Stops</div></div>
          <div class="stat"><div class="stat-val">{{ t.stays.length }}</div><div class="stat-lbl">Hotels</div></div>
          <div class="stat"><div class="stat-val">{{ activities().length }}</div><div class="stat-lbl">Activities</div></div>
          <div class="stat"><div class="stat-val">{{ t.members.length }}</div><div class="stat-lbl">Travellers</div></div>
          <div class="stat budget"><div class="stat-val">{{ budgetLabel() }}</div><div class="stat-lbl">Budget</div></div>
        </div>

        <!-- Up next -->
        @if (nextActivity(); as a) {
          <button class="upnext card" (click)="openSchedule()">
            <div class="upnext-icon" [style.background]="a.color || 'var(--brand)'">
              <i class="pi pi-arrow-right"></i>
            </div>
            <div class="upnext-text">
              <div class="upnext-label muted">Up next</div>
              <div class="upnext-title">{{ a.title }}</div>
              <div class="upnext-when muted">{{ nextWhen() }}</div>
            </div>
          </button>
        }

        <!-- Locations -->
        <div class="section-row">
          <h2 class="section-title">Locations</h2>
          <p-button
            label="Add location"
            icon="pi pi-plus"
            size="small"
            (onClick)="openCreateSegment()"
          />
        </div>

        @if (t.segments.length === 0) {
          <div class="empty-state card">
            <i class="pi pi-map-marker"></i>
            <p class="muted">No locations yet. Add the first place you'll visit.</p>
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
                    @if (s.locationLabel) { · 📍 {{ s.locationLabel }} }
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

        <!-- Hotels -->
        <div class="section-row">
          <h2 class="section-title">Hotels</h2>
          <p-button
            label="Add hotel"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            (onClick)="openCreateStay()"
          />
        </div>

        @if (t.stays.length === 0) {
          <div class="empty-state card">
            <i class="pi pi-home"></i>
            <p class="muted">No hotels yet. Add where you're staying.</p>
          </div>
        } @else {
          <div class="segment-list">
            @for (h of t.stays; track h.id) {
              <div class="segment card">
                <div class="swatch" [style.background]="h.color || '#334155'"></div>
                <div class="segment-main">
                  <div class="segment-city"><i class="pi pi-home"></i> {{ h.name }}</div>
                  <div class="segment-sub muted">
                    {{ formatDateRange(h.startDate, h.endDate) }}
                    @if (h.locationLabel) { · 📍 {{ h.locationLabel }} }
                  </div>
                </div>
                <div class="segment-actions">
                  <button class="icon-btn" (click)="openEditStay(h)">
                    <i class="pi pi-pencil"></i>
                  </button>
                  <button class="icon-btn danger" (click)="confirmDeleteStay(h)">
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
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editTripVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="savingTrip()" (onClick)="saveTrip()" />
      </ng-template>
    </p-dialog>

    <!-- Location (segment) dialog -->
    <p-dialog
      [(visible)]="segmentVisible"
      [modal]="true"
      [draggable]="false"
      [header]="segmentForm.id ? 'Edit location' : 'Add location'"
      [style]="{ width: '460px' }"
    >
      <div class="form">
        <div class="field">
          <label>City / place</label>
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
          <label>Location pin</label>
          <app-location-search
            [locationLabel]="segmentForm.locationLabel"
            (picked)="onSegmentLocationPicked($event)"
            (cleared)="onSegmentLocationCleared()"
          />
          @if (segmentForm.locationLabel) {
            <small class="muted">📍 {{ segmentForm.locationLabel }}</small>
          }
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
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="segmentVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="savingSegment()" (onClick)="saveSegment()" />
      </ng-template>
    </p-dialog>

    <!-- Hotel (stay) dialog -->
    <p-dialog
      [(visible)]="stayVisible"
      [modal]="true"
      [draggable]="false"
      [header]="stayForm.id ? 'Edit hotel' : 'Add hotel'"
      [style]="{ width: '460px' }"
    >
      <div class="form">
        <div class="field-row">
          <div class="field">
            <label>Hotel name</label>
            <input pInputText [(ngModel)]="stayForm.name" />
          </div>
          <div class="field swatch-field">
            <label>Colour</label>
            <input type="color" [(ngModel)]="stayForm.color" />
          </div>
        </div>
        <div class="field">
          <label>Location pin</label>
          <app-location-search
            [locationLabel]="stayForm.locationLabel"
            (picked)="onStayLocationPicked($event)"
            (cleared)="onStayLocationCleared()"
          />
          @if (stayForm.locationLabel) {
            <small class="muted">📍 {{ stayForm.locationLabel }}</small>
          }
        </div>
        <div class="field-row">
          <div class="field">
            <label>Check-in</label>
            <input type="date" [(ngModel)]="stayForm.startDate" />
          </div>
          <div class="field">
            <label>Check-out</label>
            <input type="date" [(ngModel)]="stayForm.endDate" />
          </div>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="stayVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="savingStay()" (onClick)="saveStay()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    /* ── Dashboard ── */
    .hero {
      padding: 16px;
      margin-bottom: 14px;
    }
    .hero-top {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .hero-text {
      flex: 1;
      min-width: 0;
    }
    .hero-text h1 {
      font-size: 22px;
      line-height: 1.2;
    }
    .hero-sub {
      font-size: 13px;
      margin-top: 2px;
    }
    .hero-actions {
      display: flex;
      flex-shrink: 0;
    }
    .countdown {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .countdown i { font-size: 12px; }
    .cd-before { background: var(--brand-light); color: var(--brand); }
    .cd-during { background: rgba(16, 185, 129, 0.16); color: #0f9d6b; }
    .cd-after { background: var(--bg-subtle); color: var(--text-secondary); }
    .hero .desc {
      margin-top: 12px;
      margin-bottom: 0;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px 8px;
      text-align: center;
      box-shadow: var(--shadow-sm);
    }
    .stat-val {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
    }
    .stat.budget .stat-val { font-size: 15px; }
    .stat-lbl {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .upnext {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      text-align: left;
      padding: 12px 14px;
      cursor: pointer;
      background: var(--bg-surface);
      margin-bottom: 6px;
    }
    .upnext-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
    }
    .upnext-text { min-width: 0; }
    .upnext-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .upnext-title {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .upnext-when { font-size: 12px; }
    .trip-nav {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      overflow-x: auto;
      // Let the buttons keep their size and scroll horizontally on phones.
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }
    .trip-nav::-webkit-scrollbar {
      height: 0;
    }
    .trip-nav ::ng-deep .p-button {
      flex-shrink: 0;
      white-space: nowrap;
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
export class TripDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  readonly trip = signal<Trip | null>(null);
  readonly activities = signal<Activity[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly loading = signal(true);

  readonly tzOptions = timezoneOptions();
  readonly formatDate = formatDate;
  readonly formatDateRange = formatDateRange;

  // Edit-trip dialog state
  readonly editTripVisible = signal(false);
  readonly savingTrip = signal(false);
  tripForm = { name: '', description: '', homeTimezone: '', baseCurrency: '' };

  // Segment (location) dialog state
  readonly segmentVisible = signal(false);
  readonly savingSegment = signal(false);
  segmentForm: SegmentForm = this.blankSegment();

  // Stay (hotel) dialog state
  readonly stayVisible = signal(false);
  readonly savingStay = signal(false);
  stayForm: StayForm = this.blankStay();

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

  /** Earliest start / latest end across both locations and hotels. */
  readonly tripBounds = computed<{ start: string; end: string } | null>(() => {
    const t = this.trip();
    if (!t) return null;
    const dates: string[] = [];
    for (const s of t.segments) dates.push(s.startDate, s.endDate);
    for (const h of t.stays) dates.push(h.startDate, h.endDate);
    if (dates.length === 0) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length - 1] };
  });

  readonly dayCount = computed(() => {
    const b = this.tripBounds();
    return b ? this.dayDiff(b.start, b.end) + 1 : 0;
  });

  readonly countdown = computed<{ state: 'before' | 'during' | 'after'; label: string } | null>(() => {
    const b = this.tripBounds();
    if (!b) return null;
    const today = this.todayStr();
    if (today < b.start) {
      const n = this.dayDiff(today, b.start);
      return { state: 'before', label: n === 1 ? 'Starts tomorrow' : `Starts in ${n} days` };
    }
    if (today > b.end) return { state: 'after', label: 'Trip complete' };
    return { state: 'during', label: `Day ${this.dayDiff(b.start, today) + 1} of ${this.dayCount()}` };
  });

  readonly budgetLabel = computed(() => {
    const total = this.expenses().reduce((sum, e) => sum + e.amountCents, 0);
    return formatMoney(total, this.trip()?.baseCurrency || 'CAD');
  });

  readonly nextActivity = computed<Activity | null>(() => {
    const now = Date.now();
    return (
      [...this.activities()]
        .filter((a) => new Date(a.startAt).getTime() >= now)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0] ?? null
    );
  });

  nextWhen(): string {
    const a = this.nextActivity();
    const t = this.trip();
    if (!a || !t) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: t.homeTimezone,
      }).format(new Date(a.startAt));
    } catch {
      return '';
    }
  }

  /** Whole days from calendar date `a` to `b` (b - a), DST-safe via UTC. */
  private dayDiff(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }

  private todayStr(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  readonly myMembership = computed(() => {
    const me = this.auth.profile()?.id;
    return this.trip()?.members.find((m) => m.user.id === me) ?? null;
  });

  readonly isOwner = computed(() => this.myMembership()?.role === 'owner');

  ngOnInit(): void {
    void this.auth.loadProfile();
    // `id` (a required router input) is available by ngOnInit, not in the
    // constructor — reading it earlier throws NG0950.
    this.load();
  }

  private blankSegment(): SegmentForm {
    return {
      id: null,
      city: '',
      country: '',
      timezone: this.trip()?.homeTimezone || 'UTC',
      startDate: '',
      endDate: '',
      color: '#4f46e5',
      lat: null,
      lng: null,
      locationLabel: '',
    };
  }

  private blankStay(): StayForm {
    return {
      id: null,
      name: '',
      startDate: '',
      endDate: '',
      color: '#334155',
      lat: null,
      lng: null,
      locationLabel: '',
    };
  }

  onSegmentLocationPicked(loc: LatLng): void {
    this.segmentForm = {
      ...this.segmentForm,
      lat: loc.lat,
      lng: loc.lng,
      locationLabel: loc.label,
    };
  }

  onSegmentLocationCleared(): void {
    this.segmentForm = {
      ...this.segmentForm,
      lat: null,
      lng: null,
      locationLabel: '',
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
    // Dashboard stats — best-effort; failures just leave counts at zero.
    this.api.getActivities(this.id()).subscribe({
      next: (a) => this.activities.set(a),
      error: () => undefined,
    });
    this.api.getExpenses(this.id()).subscribe({
      next: (e) => this.expenses.set(e),
      error: () => undefined,
    });
  }

  back(): void {
    void this.router.navigate(['/trips']);
  }

  openSchedule(): void {
    void this.router.navigate(['/trips', this.id(), 'schedule']);
  }

  openMap(): void {
    void this.router.navigate(['/trips', this.id(), 'map']);
  }

  openBudget(): void {
    void this.router.navigate(['/trips', this.id(), 'budget']);
  }

  openPacking(): void {
    void this.router.navigate(['/trips', this.id(), 'packing']);
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
      timezone: s.timezone,
      startDate: s.startDate,
      endDate: s.endDate,
      color: s.color ?? '#4f46e5',
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      locationLabel: s.locationLabel ?? '',
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
      timezone: f.timezone,
      startDate: f.startDate,
      endDate: f.endDate,
      color: f.color || undefined,
      lat: f.lat,
      lng: f.lng,
      locationLabel: f.locationLabel || null,
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
      header: 'Delete location',
      message: `Remove ${s.city} from the trip?`,
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

  // ── Stays (hotels) ──
  openCreateStay(): void {
    this.stayForm = this.blankStay();
    this.stayVisible.set(true);
  }

  openEditStay(h: Stay): void {
    this.stayForm = {
      id: h.id,
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate,
      color: h.color ?? '#334155',
      lat: h.lat ?? null,
      lng: h.lng ?? null,
      locationLabel: h.locationLabel ?? '',
    };
    this.stayVisible.set(true);
  }

  onStayLocationPicked(loc: LatLng): void {
    this.stayForm = {
      ...this.stayForm,
      lat: loc.lat,
      lng: loc.lng,
      locationLabel: loc.label,
    };
  }

  onStayLocationCleared(): void {
    this.stayForm = { ...this.stayForm, lat: null, lng: null, locationLabel: '' };
  }

  saveStay(): void {
    const f = this.stayForm;
    if (!f.name.trim() || !f.startDate || !f.endDate) {
      this.messages.add({
        severity: 'warn',
        summary: 'Missing details',
        detail: 'Hotel name, check-in and check-out are required.',
      });
      return;
    }
    if (f.startDate > f.endDate) {
      this.messages.add({
        severity: 'warn',
        summary: 'Invalid dates',
        detail: 'Check-in must be on or before check-out.',
      });
      return;
    }

    const body: StayRequest = {
      name: f.name.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      color: f.color || undefined,
      lat: f.lat,
      lng: f.lng,
      locationLabel: f.locationLabel || null,
    };

    this.savingStay.set(true);
    const req = f.id
      ? this.api.updateStay(this.id(), f.id, body)
      : this.api.createStay(this.id(), body);

    req.subscribe({
      next: () => {
        this.savingStay.set(false);
        this.stayVisible.set(false);
        this.load();
      },
      error: (e) => {
        this.savingStay.set(false);
        this.error(e);
      },
    });
  }

  confirmDeleteStay(h: Stay): void {
    this.confirm.confirm({
      header: 'Delete hotel',
      message: `Remove ${h.name}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteStay(this.id(), h.id).subscribe({
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
