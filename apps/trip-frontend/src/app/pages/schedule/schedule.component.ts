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
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ApiService } from '../../core/api.service';
import { LocationSearchComponent } from '../../shared/location-search.component';
import {
  Activity,
  CreateActivityRequest,
  LatLng,
  Tag,
  Trip,
} from '../../core/models';
import {
  ActivityPiece,
  activityPieces,
  resolveColumns,
} from '../../core/schedule-layout';
import {
  formatMinutes,
  tzAbbreviation,
  zonedParts,
  zonedTimeToUtc,
} from '../../core/tz';

const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
const COL_WIDTH = 150;
const SNAP = 15; // minutes

interface RenderedPiece extends ActivityPiece {
  activity: Activity;
  color: string;
}

interface EditorForm {
  id: string | null;
  title: string;
  notes: string;
  segmentId: string | null;
  color: string;
  tagIds: string[];
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
}

interface DragState {
  kind: 'move' | 'resize';
  activityId: string;
  startX: number;
  startY: number;
  origStartMin: number;
  duration: number;
  origColIndex: number;
  curStartMin: number;
  curEndMin: number;
  curColIndex: number;
  moved: boolean;
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [
    FormsModule,
    Button,
    Dialog,
    InputText,
    Textarea,
    Select,
    MultiSelect,
    ConfirmDialog,
    LocationSearchComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="sched">
      <!-- Toolbar -->
      <div class="toolbar">
        <button class="back" (click)="back()"><i class="pi pi-arrow-left"></i></button>
        <div class="title">{{ trip()?.name }} · Schedule</div>
        <div class="spacer"></div>
        @if (displayTzOptions().length > 1) {
          <p-select
            [ngModel]="displayTz()"
            (ngModelChange)="displayTz.set($event)"
            [options]="displayTzOptions()"
            optionLabel="label"
            optionValue="value"
            styleClass="tz-select"
            appendTo="body"
          />
        }
        <p-button label="Tags" icon="pi pi-tag" severity="secondary" [outlined]="true" size="small" (onClick)="openTagManager()" />
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (columns().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-calendar"></i>
          <p class="muted">Add stops with dates to your trip to lay out the schedule.</p>
        </div>
      } @else {
        <div class="grid-scroll">
          <div class="grid" [style.gridTemplateColumns]="gridTemplate()">
            <!-- Gutter header -->
            <div class="corner"></div>
            <!-- Column headers -->
            @for (col of columns(); track col.date) {
              <div class="col-head" [style.borderTopColor]="col.color || 'transparent'">
                <div class="col-city">{{ col.city || '—' }}</div>
                <div class="col-date">{{ headerDate(col.date) }}</div>
                <div class="col-tz muted">{{ tzAbbrev(col.date, col.tz) }}</div>
              </div>
            }

            <!-- Gutter hours -->
            <div class="gutter" [style.height.px]="dayHeight">
              @for (h of hours; track h) {
                <div class="hour-label" [style.top.px]="h * HOUR_PX">
                  <span class="disp">{{ pad(h) }}:00</span>
                  @if (showHome()) {
                    <span class="home muted">{{ homeLabel(h) }}</span>
                  }
                </div>
              }
            </div>

            <!-- Day bodies -->
            @for (col of columns(); track col.date; let ci = $index) {
              <div
                class="col-body"
                [style.height.px]="dayHeight"
                (click)="onBodyClick($event, ci)"
              >
                @for (p of piecesFor(ci); track p.activity.id + '-' + p.startMin) {
                  <div
                    class="event"
                    [class.start]="p.isStart"
                    [class.end]="p.isEnd"
                    [style.top.px]="p.startMin * PX_PER_MIN"
                    [style.height.px]="(p.endMin - p.startMin) * PX_PER_MIN"
                    [style.background]="p.color"
                    (click)="openEdit($event, p.activity)"
                    (pointerdown)="startMove($event, p)"
                  >
                    <div class="event-title">{{ p.activity.title }}</div>
                    @if (p.isStart) {
                      <div class="event-time">
                        {{ localTime(p.activity.startAt) }}–{{ localTime(p.activity.endAt) }}
                      </div>
                    }
                    @if (p.isEnd) {
                      <div class="resize-handle" (pointerdown)="startResize($event, p)"></div>
                    }
                  </div>
                }

                <!-- Drag ghost -->
                @if (ghostFor(ci); as g) {
                  <div
                    class="event ghost"
                    [style.top.px]="g.top"
                    [style.height.px]="g.height"
                  ></div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- Activity editor -->
    <p-dialog
      [(visible)]="editorVisible"
      [modal]="true"
      [draggable]="false"
      [header]="form.id ? 'Edit activity' : 'New activity'"
      [style]="{ width: '480px' }"
    >
      <div class="form">
        <div class="field">
          <label>Title</label>
          <input pInputText [(ngModel)]="form.title" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Start</label>
            <div class="dt"><input type="date" [(ngModel)]="form.startDate" /><input type="time" [(ngModel)]="form.startTime" /></div>
          </div>
          <div class="field">
            <label>End</label>
            <div class="dt"><input type="date" [(ngModel)]="form.endDate" /><input type="time" [(ngModel)]="form.endTime" /></div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>City / stay</label>
            <p-select
              [options]="segmentOptions()"
              [(ngModel)]="form.segmentId"
              optionLabel="label"
              optionValue="value"
              [showClear]="true"
              placeholder="None"
              appendTo="body"
              styleClass="w-full"
            />
          </div>
          <div class="field swatch-field">
            <label>Colour</label>
            <input type="color" [(ngModel)]="form.color" />
          </div>
        </div>
        <div class="field">
          <label>Location</label>
          <app-location-search
            [locationLabel]="form.locationLabel"
            (picked)="onLocationPicked($event)"
            (cleared)="onLocationCleared()"
          />
          @if (form.locationLabel) {
            <small class="muted loc-label">📍 {{ form.locationLabel }}</small>
          }
        </div>
        <div class="field">
          <label>Tags</label>
          <p-multiselect
            [options]="tags()"
            [(ngModel)]="form.tagIds"
            optionLabel="name"
            optionValue="id"
            placeholder="No tags"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea pTextarea rows="2" [(ngModel)]="form.notes"></textarea>
        </div>
      </div>
      <ng-template pTemplate="footer">
        @if (form.id) {
          <p-button label="Delete" severity="danger" [text]="true" (onClick)="deleteActivity()" />
        }
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editorVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- Tag manager -->
    <p-dialog
      [(visible)]="tagManagerVisible"
      [modal]="true"
      [draggable]="false"
      header="Tags"
      [style]="{ width: '380px' }"
    >
      <div class="tag-list">
        @for (t of tags(); track t.id) {
          <div class="tag-row">
            <span class="tag-dot" [style.background]="t.color"></span>
            <span class="tag-name">{{ t.name }}</span>
            <button class="icon-btn danger" (click)="deleteTag(t)"><i class="pi pi-trash"></i></button>
          </div>
        } @empty {
          <p class="muted">No tags yet.</p>
        }
      </div>
      <div class="add-tag">
        <input type="color" [(ngModel)]="newTagColor" />
        <input pInputText placeholder="New tag" [(ngModel)]="newTagName" (keyup.enter)="addTag()" />
        <p-button icon="pi pi-plus" (onClick)="addTag()" />
      </div>
    </p-dialog>
  `,
  styles: `
    .sched { display: flex; flex-direction: column; height: calc(100dvh - var(--header-height)); }
    .toolbar {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid var(--border);
      background: var(--bg-surface);
    }
    .toolbar .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toolbar .spacer { flex: 1; }
    .back { width: 34px; height: 34px; border: none; border-radius: 9px; background: var(--bg-subtle); cursor: pointer; }
    .grid-scroll { flex: 1; overflow: auto; }
    .grid { display: grid; position: relative; }
    .corner { position: sticky; left: 0; top: 0; z-index: 5; background: var(--bg-surface); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .col-head {
      position: sticky; top: 0; z-index: 4;
      background: var(--bg-surface); border-bottom: 1px solid var(--border); border-left: 1px solid var(--border);
      border-top: 3px solid transparent;
      padding: 6px 8px; text-align: center;
    }
    .col-city { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .col-date { font-size: 12px; }
    .col-tz { font-size: 11px; }
    .gutter { position: sticky; left: 0; z-index: 3; background: var(--bg-surface); border-right: 1px solid var(--border); position: relative; }
    .hour-label { position: absolute; right: 6px; display: flex; flex-direction: column; align-items: flex-end; transform: translateY(-1px); font-size: 11px; line-height: 1.1; }
    .hour-label .home { font-size: 10px; }
    .col-body {
      position: relative; border-left: 1px solid var(--border);
      background-image: repeating-linear-gradient(
        to bottom,
        var(--border) 0,
        var(--border) 1px,
        transparent 1px,
        transparent ${HOUR_PX}px
      );
      cursor: copy;
    }
    .event {
      position: absolute; left: 3px; right: 3px;
      border-radius: 6px; color: #fff; padding: 3px 6px;
      font-size: 11px; overflow: hidden; cursor: grab;
      box-shadow: var(--shadow-sm); touch-action: none;
    }
    .event.ghost { background: rgba(79,70,229,0.35); border: 1px dashed var(--brand); pointer-events: none; }
    .event-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .event-time { opacity: 0.9; font-size: 10px; }
    .resize-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; cursor: ns-resize; }
    .form { display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .field input, .field textarea { width: 100%; }
    .field-row { display: flex; gap: 12px; }
    .field-row .field { flex: 1; }
    .dt { display: flex; gap: 6px; }
    .dt input { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font: inherit; }
    .swatch-field { flex: 0 0 64px; }
    .swatch-field input[type='color'] { width: 100%; height: 40px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; }
    .tag-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .tag-row { display: flex; align-items: center; gap: 8px; }
    .tag-dot { width: 14px; height: 14px; border-radius: 50%; }
    .tag-name { flex: 1; }
    .add-tag { display: flex; gap: 8px; align-items: center; }
    .add-tag input[pInputText] { flex: 1; }
    .add-tag input[type='color'] { width: 38px; height: 38px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; }
    .icon-btn { width: 30px; height: 30px; border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-secondary); }
    .icon-btn.danger { color: #e8643c; }
    :host ::ng-deep .w-full { width: 100%; }
    :host ::ng-deep .tz-select { min-width: 150px; }
  `,
})
export class ScheduleComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly id = input.required<string>();

  readonly HOUR_PX = HOUR_PX;
  readonly PX_PER_MIN = PX_PER_MIN;
  readonly dayHeight = 24 * HOUR_PX;
  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  readonly trip = signal<Trip | null>(null);
  readonly activities = signal<Activity[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);

  readonly displayTz = signal<string>('UTC');

  readonly tzAbbrev = (date: string, tz: string) =>
    tzAbbreviation(tz, zonedTimeToUtc(date, 12 * 60, tz));

  readonly columns = computed(() => {
    const t = this.trip();
    if (!t) return [];
    return resolveColumns(t.segments, t.homeTimezone);
  });

  readonly columnDates = computed(() => this.columns().map((c) => c.date));

  readonly showHome = computed(
    () => this.trip()?.homeTimezone !== this.displayTz()
  );

  readonly displayTzOptions = computed(() => {
    const t = this.trip();
    if (!t) return [];
    const set = new Map<string, string>();
    set.set(t.homeTimezone, `${t.homeTimezone} (home)`);
    for (const s of t.segments) set.set(s.timezone, s.timezone);
    return [...set.entries()].map(([value, label]) => ({ label, value }));
  });

  readonly segmentOptions = computed(() =>
    (this.trip()?.segments ?? []).map((s) => ({
      label: `${s.city} (${s.startDate}→${s.endDate})`,
      value: s.id,
    }))
  );

  // Precomputed pieces grouped by column index.
  readonly piecesByCol = computed(() => {
    const dates = this.columnDates();
    const tz = this.displayTz();
    const byCol: RenderedPiece[][] = dates.map(() => []);
    for (const a of this.activities()) {
      const color = a.color || a.tags[0]?.color || this.colColor(a) || '#4f46e5';
      for (const p of activityPieces(a.startAt, a.endAt, dates, tz)) {
        byCol[p.colIndex].push({ ...p, activity: a, color });
      }
    }
    return byCol;
  });

  // ── Editor / dialog state ──
  readonly editorVisible = signal(false);
  readonly saving = signal(false);
  form: EditorForm = this.blankForm();

  readonly tagManagerVisible = signal(false);
  newTagName = '';
  newTagColor = '#4f46e5';

  // ── Drag state ──
  readonly drag = signal<DragState | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const tripId = this.id();
    this.api.getTrip(tripId).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        this.displayTz.set(trip.homeTimezone);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getTags(tripId).subscribe((t) => this.tags.set(t));
    this.api.getActivities(tripId).subscribe((a) => this.activities.set(a));
  }

  private reloadActivities(): void {
    this.api.getActivities(this.id()).subscribe((a) => this.activities.set(a));
  }

  back(): void {
    void this.router.navigate(['/trips', this.id()]);
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  headerDate(date: string): string {
    const [, m, d] = date.split('-');
    return `${m}/${d}`;
  }

  private colColor(a: Activity): string | null {
    const col = this.columns().find((c) => {
      const seg = this.trip()?.segments.find((s) => s.id === a.segmentId);
      return seg ? c.city === seg.city : false;
    });
    return col?.color ?? null;
  }

  piecesFor(ci: number): RenderedPiece[] {
    const dragging = this.drag();
    const pieces = this.piecesByCol()[ci] ?? [];
    if (dragging) return pieces.filter((p) => p.activity.id !== dragging.activityId);
    return pieces;
  }

  ghostFor(ci: number): { top: number; height: number } | null {
    const d = this.drag();
    if (!d || d.curColIndex !== ci) return null;
    return {
      top: d.curStartMin * PX_PER_MIN,
      height: (d.curEndMin - d.curStartMin) * PX_PER_MIN,
    };
  }

  localTime(iso: string): string {
    return formatMinutes(zonedParts(new Date(iso), this.displayTz()).minutes);
  }

  homeLabel(hour: number): string {
    const t = this.trip();
    const dates = this.columnDates();
    if (!t || dates.length === 0) return '';
    const instant = zonedTimeToUtc(dates[0], hour * 60, this.displayTz());
    return formatMinutes(zonedParts(instant, t.homeTimezone).minutes);
  }

  gridTemplate(): string {
    return `64px repeat(${this.columns().length}, ${COL_WIDTH}px)`;
  }

  // ── Create via click ──
  onBodyClick(event: MouseEvent, ci: number): void {
    if (this.drag()) return; // ignore the click that ends a drag
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const minutes = this.snap(Math.max(0, Math.min(this.dayHeight, y)) / PX_PER_MIN);
    this.openCreate(ci, minutes);
  }

  private snap(min: number): number {
    return Math.round(min / SNAP) * SNAP;
  }

  // ── Drag move / resize ──
  startMove(event: PointerEvent, p: RenderedPiece): void {
    event.stopPropagation();
    const duration = this.activityDurationMin(p.activity);
    this.beginDrag(event, 'move', p, duration);
  }

  startResize(event: PointerEvent, p: RenderedPiece): void {
    event.stopPropagation();
    const duration = this.activityDurationMin(p.activity);
    this.beginDrag(event, 'resize', p, duration);
  }

  private activityDurationMin(a: Activity): number {
    return Math.round(
      (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000
    );
  }

  private beginDrag(
    event: PointerEvent,
    kind: 'move' | 'resize',
    p: RenderedPiece,
    duration: number
  ): void {
    const tz = this.displayTz();
    const s = zonedParts(new Date(p.activity.startAt), tz);
    const startMin = s.minutes;
    const startColIndex = this.columnDates().indexOf(s.date);

    this.drag.set({
      kind,
      activityId: p.activity.id,
      startX: event.clientX,
      startY: event.clientY,
      origStartMin: startMin,
      duration,
      origColIndex: startColIndex < 0 ? p.colIndex : startColIndex,
      curStartMin: startMin,
      curEndMin: startMin + duration,
      curColIndex: startColIndex < 0 ? p.colIndex : startColIndex,
      moved: false,
    });

    const move = (e: PointerEvent) => this.onDragMove(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.onDragEnd(e);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private onDragMove(event: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    const dyMin = this.snap((event.clientY - d.startY) / PX_PER_MIN);
    const dCol = Math.round((event.clientX - d.startX) / COL_WIDTH);
    const maxCol = this.columnDates().length - 1;

    if (d.kind === 'move') {
      let start = d.origStartMin + dyMin;
      start = Math.max(0, Math.min(1440 - d.duration, start));
      const col = Math.max(0, Math.min(maxCol, d.origColIndex + dCol));
      this.drag.set({
        ...d,
        curStartMin: start,
        curEndMin: start + d.duration,
        curColIndex: col,
        moved: true,
      });
    } else {
      let end = d.origStartMin + d.duration + dyMin;
      end = Math.max(d.origStartMin + SNAP, Math.min(1440, end));
      this.drag.set({ ...d, curEndMin: end, moved: true });
    }
  }

  private onDragEnd(_event: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    if (!d.moved) {
      this.drag.set(null);
      return;
    }

    const tz = this.displayTz();
    const dates = this.columnDates();
    const colDate = dates[d.curColIndex];
    // Drag keeps an activity within one day column, so both bounds map onto
    // the same column date; spanning is re-derived on reload.
    const startISO = zonedTimeToUtc(colDate, d.curStartMin, tz).toISOString();
    const endISO = zonedTimeToUtc(colDate, d.curEndMin, tz).toISOString();

    // Keep the drag visible until the request resolves to avoid a flash.
    this.api
      .updateActivity(this.id(), d.activityId, {
        startAt: startISO,
        endAt: endISO,
      })
      .subscribe({
        next: () => {
          this.drag.set(null);
          this.reloadActivities();
        },
        error: (e) => {
          this.drag.set(null);
          this.error(e);
        },
      });
  }

  // ── Editor ──
  private blankForm(): EditorForm {
    return {
      id: null,
      title: '',
      notes: '',
      segmentId: null,
      color: '#4f46e5',
      tagIds: [],
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '10:00',
      lat: null,
      lng: null,
      locationLabel: '',
    };
  }

  onLocationPicked(loc: LatLng): void {
    this.form = {
      ...this.form,
      lat: loc.lat,
      lng: loc.lng,
      locationLabel: loc.label,
    };
  }

  onLocationCleared(): void {
    this.form = { ...this.form, lat: null, lng: null, locationLabel: '' };
  }

  openCreate(ci: number, minutes: number): void {
    const tz = this.displayTz();
    const dates = this.columnDates();
    const date = dates[ci];
    const startISO = zonedTimeToUtc(date, minutes, tz);
    const endISO = new Date(startISO.getTime() + 60 * 60000);
    const seg = this.columns()[ci];
    const segId =
      this.trip()?.segments.find((s) => s.city === seg.city)?.id ?? null;

    this.form = {
      ...this.blankForm(),
      segmentId: segId,
      color: seg.color || '#4f46e5',
      startDate: date,
      startTime: formatMinutes(minutes),
      endDate: zonedParts(endISO, tz).date,
      endTime: formatMinutes(zonedParts(endISO, tz).minutes),
    };
    this.editorVisible.set(true);
  }

  openEdit(event: MouseEvent, a: Activity): void {
    event.stopPropagation();
    if (this.drag()) return;
    const tz = this.displayTz();
    const s = zonedParts(new Date(a.startAt), tz);
    const e = zonedParts(new Date(a.endAt), tz);
    this.form = {
      id: a.id,
      title: a.title,
      notes: a.notes ?? '',
      segmentId: a.segmentId,
      color: a.color || a.tags[0]?.color || '#4f46e5',
      tagIds: a.tags.map((t) => t.id),
      startDate: s.date,
      startTime: formatMinutes(s.minutes),
      endDate: e.date,
      endTime: formatMinutes(e.minutes),
      lat: a.lat ?? null,
      lng: a.lng ?? null,
      locationLabel: a.locationLabel ?? '',
    };
    this.editorVisible.set(true);
  }

  save(): void {
    const f = this.form;
    if (!f.title.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Title required', detail: 'Name the activity.' });
      return;
    }
    const tz = this.displayTz();
    const startISO = zonedTimeToUtc(f.startDate, this.timeToMin(f.startTime), tz).toISOString();
    const endISO = zonedTimeToUtc(f.endDate, this.timeToMin(f.endTime), tz).toISOString();
    if (new Date(endISO) <= new Date(startISO)) {
      this.messages.add({ severity: 'warn', summary: 'Invalid times', detail: 'End must be after start.' });
      return;
    }

    const body: CreateActivityRequest = {
      title: f.title.trim(),
      notes: f.notes.trim() || undefined,
      segmentId: f.segmentId,
      color: f.color || undefined,
      tagIds: f.tagIds,
      startAt: startISO,
      endAt: endISO,
      lat: f.lat,
      lng: f.lng,
      locationLabel: f.locationLabel || null,
    };

    this.saving.set(true);
    const req = f.id
      ? this.api.updateActivity(this.id(), f.id, body)
      : this.api.createActivity(this.id(), body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.editorVisible.set(false);
        this.reloadActivities();
      },
      error: (e) => {
        this.saving.set(false);
        this.error(e);
      },
    });
  }

  deleteActivity(): void {
    const id = this.form.id;
    if (!id) return;
    this.confirm.confirm({
      header: 'Delete activity',
      message: `Remove "${this.form.title}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteActivity(this.id(), id).subscribe({
          next: () => {
            this.editorVisible.set(false);
            this.reloadActivities();
          },
          error: (e) => this.error(e),
        });
      },
    });
  }

  private timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // ── Tags ──
  openTagManager(): void {
    this.tagManagerVisible.set(true);
  }

  addTag(): void {
    const name = this.newTagName.trim();
    if (!name) return;
    this.api.createTag(this.id(), { name, color: this.newTagColor }).subscribe({
      next: (tag) => {
        this.tags.set([...this.tags(), tag].sort((a, b) => a.name.localeCompare(b.name)));
        this.newTagName = '';
      },
      error: (e) => this.error(e),
    });
  }

  deleteTag(tag: Tag): void {
    this.api.deleteTag(this.id(), tag.id).subscribe({
      next: () => {
        this.tags.set(this.tags().filter((t) => t.id !== tag.id));
        this.reloadActivities();
      },
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
