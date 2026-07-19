import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  PublicUser,
  Wheel,
  WheelItem,
  WheelRole,
  WheelTag,
} from '../../core/models';

interface WheelSegment {
  text: string;
  color: string;
  startAngle: number;
  endAngle: number;
}

// Palette new tags cycle through, so chips stay visually distinct.
const TAG_PALETTE = [
  '#11998e',
  '#e8643c',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#ec4899',
  '#10b981',
  '#6366f1',
];

const TAU = 2 * Math.PI;
// The pointer sits at the top of the wheel, i.e. at 3π/2 in canvas angles.
const POINTER_ANGLE = (3 * Math.PI) / 2;

@Component({
  selector: 'app-wheel-detail',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, MultiSelect],
  template: `
    @if (mode() === 'view') {
      <!-- ══ VIEW MODE — the wheel, as big as possible ══ -->
      <div class="view-page">
        <div class="view-head">
          <button class="icon-btn" (click)="goBack()" aria-label="Back">
            <i class="pi pi-arrow-left"></i>
          </button>
          <div class="title-block">
            <h1>{{ name() }}</h1>
            @if (role() === 'editor') {
              <span class="subtitle">
                <i class="pi pi-users"></i>
                Shared by &#64;{{ owner()?.username || owner()?.name }}
              </span>
            } @else if (sharedWith().length > 0) {
              <span class="subtitle">
                <i class="pi pi-users"></i>
                Shared with {{ sharedWith().length }}
                {{ sharedWith().length === 1 ? 'person' : 'people' }}
              </span>
            }
          </div>
          @if (role() === 'owner') {
            <button
              class="icon-btn"
              (click)="openShare()"
              aria-label="Share wheel"
            >
              <i class="pi pi-user-plus"></i>
            </button>
          }
          <button
            class="icon-btn"
            (click)="enterEdit()"
            aria-label="Edit wheel"
          >
            <i class="pi pi-pencil"></i>
          </button>
        </div>

        <div class="wheel-stage" #stage>
          <canvas #canvas></canvas>
          @if (segments().length === 0) {
            <div class="stage-empty">
              <i class="pi pi-bullseye"></i>
              @if (items().length === 0) {
                <p>No items yet.</p>
                <p-button
                  label="Add items"
                  icon="pi pi-pencil"
                  [outlined]="true"
                  (onClick)="enterEdit()"
                />
              } @else if (activeItems().length === 0) {
                <p>Everything is archived.</p>
                <p-button
                  label="Restore items"
                  icon="pi pi-replay"
                  [outlined]="true"
                  (onClick)="enterEdit()"
                />
              } @else {
                <p>No items match the active tag filter.</p>
              }
            </div>
          }
        </div>

        <div class="view-controls">
          @if (tags().length > 0) {
            <div class="filter-row">
              @for (tag of tags(); track tag.name) {
                <button
                  class="filter-chip"
                  [class.active]="isFilterActive(tag.name)"
                  [style.--chip]="tag.color"
                  (click)="toggleFilter(tag.name)"
                >
                  <span class="dot"></span>
                  {{ tag.name }}
                </button>
              }
              @if (activeFilters().length > 0) {
                <button class="link-btn" (click)="clearFilters()">
                  Clear
                </button>
              }
            </div>
          }
          <p-button
            [label]="isSpinning() ? 'Spinning…' : 'Spin the wheel!'"
            icon="pi pi-refresh"
            styleClass="spin-btn"
            [disabled]="isSpinning() || segments().length === 0"
            (onClick)="spin()"
          />
        </div>
      </div>
    } @else {
      <!-- ══ EDIT MODE — items, tags & everything else ══ -->
      <div class="page">
        <div class="page-head">
          <button
            class="icon-btn"
            (click)="cancelEdit()"
            aria-label="Discard changes"
          >
            <i class="pi pi-times"></i>
          </button>
          <input
            class="name-input"
            pInputText
            [(ngModel)]="nameModel"
            placeholder="Wheel name"
          />
          <p-button
            label="Save"
            icon="pi pi-check"
            [loading]="saving()"
            (onClick)="saveAndClose()"
          />
        </div>
        <p class="edit-hint muted">
          Changes only apply once you hit <b>Save</b>.
        </p>

        <div class="card section">
          <div class="section-head">
            <span>
              Items ({{ items().length }}
              @if (archivedCount() > 0) {
                · {{ archivedCount() }} archived
              })
            </span>
            <button class="link-btn" (click)="addItem()">
              <i class="pi pi-plus"></i> Add
            </button>
          </div>

          @if (items().length > 1 || archivedCount() > 0) {
            <div class="bulk-row">
              @if (archivedCount() > 0) {
                <button class="bulk-btn" (click)="restoreAll()">
                  <i class="pi pi-replay"></i> Restore all
                </button>
                <button class="bulk-btn danger" (click)="deleteArchived()">
                  <i class="pi pi-trash"></i> Delete archived
                </button>
              }
              @if (enabledCount() > 0 && items().length > 1) {
                <button class="bulk-btn" (click)="archiveAll()">
                  <i class="pi pi-inbox"></i> Archive all
                </button>
              }
            </div>
          }

          @if (items().length === 0) {
            <p class="muted hint">No items yet — add your options here.</p>
          }

          @for (item of items(); track $index) {
            <div class="item-row" [class.archived]="!item.enabled">
              <button
                class="toggle-btn"
                (click)="toggleItemEnabled($index)"
                [attr.aria-label]="
                  item.enabled ? 'Archive item' : 'Restore item'
                "
                [title]="item.enabled ? 'On the wheel' : 'Archived'"
              >
                <i
                  [class]="
                    item.enabled ? 'pi pi-check-circle' : 'pi pi-circle'
                  "
                ></i>
              </button>
              <input
                pInputText
                class="item-label"
                [ngModel]="item.label"
                (ngModelChange)="setItemLabel($index, $event)"
                placeholder="Option name"
              />
              <p-multiSelect
                styleClass="item-tags"
                [options]="tags()"
                optionLabel="name"
                optionValue="name"
                [ngModel]="item.tags"
                (ngModelChange)="setItemTags($index, $event)"
                placeholder="Tags"
                display="chip"
                [showToggleAll]="false"
                appendTo="body"
                [filter]="false"
              />
              <button
                class="row-del"
                (click)="removeItem($index)"
                aria-label="Remove item"
              >
                <i class="pi pi-times"></i>
              </button>
            </div>
          }
        </div>

        <div class="card section">
          <div class="section-head"><span>Tags</span></div>
          <div class="tag-add">
            <input
              pInputText
              [(ngModel)]="newTagName"
              placeholder="New tag (e.g. restaurant)"
              (keyup.enter)="addTag()"
            />
            <p-button icon="pi pi-plus" [text]="true" (onClick)="addTag()" />
          </div>
          @if (tags().length > 0) {
            <div class="tag-list">
              @for (tag of tags(); track tag.name) {
                <span class="tag-pill" [style.--chip]="tag.color">
                  <span class="dot"></span>
                  {{ tag.name }}
                  <button
                    class="tag-del"
                    (click)="removeTag(tag.name)"
                    aria-label="Remove tag"
                  >
                    <i class="pi pi-times"></i>
                  </button>
                </span>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- ── Winner ── -->
    <p-dialog
      [(visible)]="showWinner"
      [modal]="true"
      [showHeader]="false"
      [style]="{ width: '24rem' }"
      [dismissableMask]="true"
    >
      <div class="winner">
        <div class="confetti"><i class="pi pi-star-fill"></i></div>
        <h2>Winner!</h2>
        <div class="winner-name">{{ selectedItem() }}</div>
        <div class="winner-actions">
          <p-button
            label="Archive from wheel"
            icon="pi pi-inbox"
            severity="secondary"
            [outlined]="true"
            (onClick)="archiveWinner()"
          />
          <p-button label="Keep & close" (onClick)="showWinner.set(false)" />
        </div>
        <p class="winner-hint muted">
          Archived items stay in your list — restore them from the edit page.
        </p>
      </div>
    </p-dialog>

    <!-- ── Share ── -->
    <p-dialog
      [(visible)]="shareOpen"
      [modal]="true"
      header="Share wheel"
      [style]="{ width: '26rem' }"
      [dismissableMask]="true"
    >
      <p class="share-blurb muted">
        Anyone you share with can spin <b>and edit</b> this wheel.
      </p>

      <div class="share-search">
        <span class="search-icon"><i class="pi pi-search"></i></span>
        <input
          pInputText
          [(ngModel)]="shareQuery"
          (ngModelChange)="onShareQueryChange($event)"
          placeholder="Search by username or name"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
        />
      </div>

      @if (searching()) {
        <div class="share-empty muted">
          <i class="pi pi-spin pi-spinner"></i> Searching…
        </div>
      } @else if (searchResults().length > 0) {
        <div class="share-results">
          @for (user of searchResults(); track user.id) {
            <div class="person-row">
              <div class="person-info">
                <span class="person-name">{{ user.name }}</span>
                @if (user.username) {
                  <span class="person-handle">&#64;{{ user.username }}</span>
                }
              </div>
              @if (isCollaborator(user.id)) {
                <span class="person-added muted">Added</span>
              } @else {
                <p-button
                  icon="pi pi-plus"
                  size="small"
                  [text]="true"
                  [loading]="sharing()"
                  (onClick)="share(user)"
                />
              }
            </div>
          }
        </div>
      } @else if (shareQuery.trim().length > 0) {
        <div class="share-empty muted">No one found with that name.</div>
      }

      <div class="share-people">
        <div class="share-people-head">People with access</div>
        <div class="person-row">
          <div class="person-info">
            <span class="person-name">
              {{ owner()?.name }}
              <i class="pi pi-star-fill owner-star" title="Owner"></i>
            </span>
            @if (owner()?.username) {
              <span class="person-handle">&#64;{{ owner()?.username }}</span>
            }
          </div>
        </div>
        @for (user of sharedWith(); track user.id) {
          <div class="person-row">
            <div class="person-info">
              <span class="person-name">{{ user.name }}</span>
              @if (user.username) {
                <span class="person-handle">&#64;{{ user.username }}</span>
              }
            </div>
            <button
              class="row-del"
              (click)="unshare(user)"
              aria-label="Remove access"
            >
              <i class="pi pi-times"></i>
            </button>
          </div>
        }
      </div>
    </p-dialog>
  `,
  styles: `
    /* ── Shared bits ── */
    .icon-btn {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      border-radius: 10px;
      color: var(--text-primary);
      cursor: pointer;
      &:hover {
        background: var(--bg-subtle);
      }
    }
    .link-btn {
      border: none;
      background: transparent;
      color: var(--brand);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      text-transform: none;
      letter-spacing: 0;
    }

    /* ── View mode ── */
    .view-page {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: var(--content-max-width);
      margin: 0 auto;
      width: 100%;
      padding: 12px 16px 0;
      height: calc(
        100dvh - var(--header-height) - var(--bottom-nav-height) -
          var(--safe-bottom) - 16px
      );
    }
    @media (min-width: 768px) {
      .view-page {
        height: calc(100dvh - var(--header-height) - 16px);
      }
    }
    .view-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .title-block {
      flex: 1;
      min-width: 0;
      h1 {
        font-size: 18px;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subtitle {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: var(--text-secondary);
        font-weight: 600;
        i {
          font-size: 11px;
          color: var(--brand);
        }
      }
    }
    .wheel-stage {
      position: relative;
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      canvas {
        display: block;
      }
    }
    .stage-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--text-secondary);
      text-align: center;
      i {
        font-size: 40px;
        color: var(--text-muted);
      }
    }
    .view-controls {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      padding-bottom: 12px;
    }
    :host ::ng-deep .spin-btn {
      width: 100%;
      max-width: 420px;
      .p-button {
        width: 100%;
        justify-content: center;
        padding-block: 12px;
        font-size: 16px;
      }
    }

    /* ── Edit mode ── */
    .page-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .edit-hint {
      font-size: 12px;
      margin: 0 4px 14px;
    }
    .name-input {
      flex: 1;
      min-width: 0;
      font-weight: 600;
    }
    .section {
      padding: 14px 16px;
      margin-bottom: 16px;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .bulk-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .bulk-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      &:hover {
        background: var(--bg-subtle);
        color: var(--text-primary);
      }
      &.danger:hover {
        color: #e8643c;
      }
      i {
        font-size: 12px;
      }
    }
    .hint {
      font-size: 13px;
    }
    .filter-row,
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .tag-list {
      justify-content: flex-start;
    }
    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--chip);
      }
      &.active {
        border-color: var(--chip);
        background: color-mix(in srgb, var(--chip) 14%, white);
        color: var(--text-primary);
      }
    }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      &.archived {
        .item-label {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        opacity: 0.65;
      }
    }
    .toggle-btn {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: var(--brand);
      font-size: 17px;
      &:hover {
        background: var(--bg-subtle);
      }
      .archived & {
        color: var(--text-muted);
      }
    }
    .item-label {
      flex: 1;
      min-width: 0;
    }
    :host ::ng-deep .item-tags {
      width: 130px;
      flex-shrink: 0;
    }
    .row-del {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 8px;
      cursor: pointer;
      &:hover {
        background: var(--bg-subtle);
        color: #e8643c;
      }
    }
    .tag-add {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      input {
        flex: 1;
      }
    }
    .tag-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px 5px 12px;
      border-radius: 999px;
      background: var(--bg-subtle);
      font-size: 13px;
      font-weight: 600;
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--chip);
      }
    }
    .tag-del {
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      &:hover {
        color: #e8643c;
      }
    }

    /* ── Winner dialog ── */
    .winner {
      text-align: center;
      padding: 8px 4px;
    }
    .confetti i {
      font-size: 34px;
      color: var(--accent);
    }
    .winner h2 {
      font-size: 20px;
      margin: 8px 0;
    }
    .winner-name {
      font-size: 24px;
      font-weight: 700;
      color: var(--brand);
      padding: 14px;
      margin: 8px 0 18px;
      background: var(--brand-light);
      border-radius: var(--radius-md);
      word-break: break-word;
    }
    .winner-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .winner-hint {
      font-size: 12px;
      margin-top: 12px;
    }
    :host ::ng-deep .winner-actions .p-button {
      width: 100%;
      justify-content: center;
    }

    /* ── Share dialog ── */
    .share-blurb {
      font-size: 13px;
      margin-bottom: 14px;
    }
    .share-search {
      position: relative;
      margin-bottom: 10px;
      .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-muted);
        font-size: 13px;
      }
      input {
        width: 100%;
        padding-left: 34px;
      }
    }
    .share-results {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
      max-height: 200px;
      overflow-y: auto;
    }
    .share-empty {
      font-size: 13px;
      padding: 10px 4px;
    }
    .share-people {
      margin-top: 16px;
    }
    .share-people-head {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .person-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      &:not(:last-child) {
        border-bottom: 1px solid var(--border);
      }
    }
    .person-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .person-name {
      font-weight: 600;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .owner-star {
      font-size: 11px;
      color: #f59e0b;
    }
    .person-handle {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .person-added {
      font-size: 12px;
      font-weight: 600;
    }
  `,
})
export class WheelDetailComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private stageEl?: HTMLDivElement;
  private resizeObserver?: ResizeObserver;

  @ViewChild('stage') set stageRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.stageEl = ref?.nativeElement;
    if (this.stageEl) {
      this.resizeObserver = new ResizeObserver(() => this.sizeCanvas());
      this.resizeObserver.observe(this.stageEl);
      // Wait a tick so the canvas ViewChild is resolved too.
      setTimeout(() => this.sizeCanvas(), 0);
    }
  }

  // Route param (component input binding).
  @Input() set id(value: string) {
    this.wheelId.set(value);
    this.load(value);
  }

  private readonly wheelId = signal<string>('');

  readonly mode = signal<'view' | 'edit'>('view');

  nameModel = '';
  newTagName = '';
  shareQuery = '';

  readonly name = signal('');
  readonly items = signal<WheelItem[]>([]);
  readonly tags = signal<WheelTag[]>([]);
  readonly owner = signal<PublicUser | null>(null);
  readonly role = signal<WheelRole>('owner');
  readonly sharedWith = signal<PublicUser[]>([]);
  readonly activeFilters = signal<string[]>([]);
  readonly saving = signal(false);

  readonly shareOpen = signal(false);
  readonly searching = signal(false);
  readonly sharing = signal(false);
  readonly searchResults = signal<PublicUser[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isSpinning = signal(false);
  readonly selectedItem = signal<string | null>(null);
  readonly showWinner = signal(false);

  private currentRotation = 0;
  private animationId: number | null = null;
  // Snapshot taken when entering edit mode, restored on cancel.
  private editSnapshot: {
    name: string;
    items: WheelItem[];
    tags: WheelTag[];
  } | null = null;

  readonly enabledCount = computed(
    () => this.items().filter((i) => i.enabled).length
  );
  readonly archivedCount = computed(
    () => this.items().filter((i) => !i.enabled).length
  );

  /** Items that are on the wheel (named + not archived). */
  readonly activeItems = computed<WheelItem[]>(() =>
    this.items().filter((i) => i.enabled && i.label.trim() !== '')
  );

  readonly filteredItems = computed<WheelItem[]>(() => {
    const filters = this.activeFilters();
    const items = this.activeItems();
    if (filters.length === 0) return items;
    return items.filter((i) => i.tags.some((t) => filters.includes(t)));
  });

  readonly segments = computed<WheelSegment[]>(() => {
    const items = this.filteredItems();
    if (items.length === 0) return [];

    const anglePerSegment = TAU / items.length;
    return items.map((item, index) => ({
      text: item.label,
      color: this.colorForItem(item, index, items.length),
      startAngle: index * anglePerSegment,
      endAngle: (index + 1) * anglePerSegment,
    }));
  });

  constructor() {
    // Redraw whenever the visible segments change.
    effect(() => {
      this.segments();
      setTimeout(() => this.drawWheel(), 0);
    });
  }

  ngOnDestroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    this.resizeObserver?.disconnect();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  private load(id: string): void {
    this.api.getWheel(id).subscribe({
      next: (wheel) => this.applyWheel(wheel),
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: 'Could not load wheel',
        });
        this.router.navigate(['/wheels']);
      },
    });
  }

  private applyWheel(wheel: Wheel): void {
    this.name.set(wheel.name);
    this.tags.set(wheel.tags);
    this.items.set(
      wheel.items.map((i) => ({
        label: i.label,
        tags: [...i.tags],
        enabled: i.enabled ?? true,
      }))
    );
    this.owner.set(wheel.owner);
    this.role.set(wheel.role);
    this.sharedWith.set(wheel.sharedWith);
    this.activeFilters.set([]);
  }

  // ── Mode switching ──
  enterEdit(): void {
    this.editSnapshot = {
      name: this.name(),
      items: this.items().map((i) => ({ ...i, tags: [...i.tags] })),
      tags: this.tags().map((t) => ({ ...t })),
    };
    this.nameModel = this.name();
    this.mode.set('edit');
  }

  cancelEdit(): void {
    if (this.editSnapshot) {
      this.name.set(this.editSnapshot.name);
      this.items.set(this.editSnapshot.items);
      this.tags.set(this.editSnapshot.tags);
      this.editSnapshot = null;
    }
    this.mode.set('view');
  }

  saveAndClose(): void {
    this.name.set(this.nameModel.trim() || 'Untitled wheel');
    // Nameless rows only ever exist mid-edit; drop them on save.
    this.items.update((list) => list.filter((i) => i.label.trim() !== ''));

    this.persist(() => {
      this.editSnapshot = null;
      this.mode.set('view');
      this.messages.add({ severity: 'success', summary: 'Saved' });
    });
  }

  private persist(onSuccess?: () => void): void {
    this.saving.set(true);
    this.api
      .saveWheel(this.wheelId(), {
        name: this.name(),
        tags: this.tags(),
        items: this.items()
          .filter((i) => i.label.trim() !== '')
          .map((i) => ({
            label: i.label.trim(),
            tags: i.tags,
            enabled: i.enabled,
          })),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          onSuccess?.();
        },
        error: () => {
          this.saving.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'Could not save wheel',
          });
        },
      });
  }

  // ── Editing ──
  setItemLabel(index: number, label: string): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, label } : item))
    );
  }

  setItemTags(index: number, tags: string[]): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, tags } : item))
    );
  }

  toggleItemEnabled(index: number): void {
    this.items.update((list) =>
      list.map((item, i) =>
        i === index ? { ...item, enabled: !item.enabled } : item
      )
    );
  }

  addItem(): void {
    this.items.update((list) => [
      ...list,
      { label: '', tags: [], enabled: true },
    ]);
  }

  removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  // ── Bulk controls ──
  restoreAll(): void {
    this.items.update((list) =>
      list.map((item) => ({ ...item, enabled: true }))
    );
  }

  archiveAll(): void {
    this.items.update((list) =>
      list.map((item) => ({ ...item, enabled: false }))
    );
  }

  deleteArchived(): void {
    this.items.update((list) => list.filter((item) => item.enabled));
  }

  addTag(): void {
    const name = this.newTagName.trim();
    if (!name) return;
    if (this.tags().some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      this.messages.add({
        severity: 'warn',
        summary: 'Tag already exists',
      });
      return;
    }
    const color = TAG_PALETTE[this.tags().length % TAG_PALETTE.length];
    this.tags.update((list) => [...list, { name, color }]);
    this.newTagName = '';
  }

  removeTag(name: string): void {
    this.tags.update((list) => list.filter((t) => t.name !== name));
    // Drop the tag from any items + active filters that reference it.
    this.items.update((list) =>
      list.map((item) => ({
        ...item,
        tags: item.tags.filter((t) => t !== name),
      }))
    );
    this.activeFilters.update((f) => f.filter((t) => t !== name));
  }

  // ── Filtering ──
  isFilterActive(name: string): boolean {
    return this.activeFilters().includes(name);
  }

  toggleFilter(name: string): void {
    this.activeFilters.update((filters) =>
      filters.includes(name)
        ? filters.filter((t) => t !== name)
        : [...filters, name]
    );
  }

  clearFilters(): void {
    this.activeFilters.set([]);
  }

  // ── Sharing ──
  openShare(): void {
    this.shareQuery = '';
    this.searchResults.set([]);
    this.shareOpen.set(true);
  }

  onShareQueryChange(query: string): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    const term = query.trim();
    if (!term) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(() => {
      this.api.searchUsers(term).subscribe({
        next: (users) => {
          this.searchResults.set(users);
          this.searching.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.searching.set(false);
        },
      });
    }, 250);
  }

  isCollaborator(userId: string): boolean {
    return (
      this.owner()?.id === userId ||
      this.sharedWith().some((u) => u.id === userId)
    );
  }

  share(user: PublicUser): void {
    if (!user.username) return;
    this.sharing.set(true);
    this.api.shareWheel(this.wheelId(), user.username).subscribe({
      next: (wheel) => {
        this.sharing.set(false);
        this.sharedWith.set(wheel.sharedWith);
        this.messages.add({
          severity: 'success',
          summary: `Shared with @${user.username}`,
        });
      },
      error: () => {
        this.sharing.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Could not share wheel',
        });
      },
    });
  }

  unshare(user: PublicUser): void {
    this.api.unshareWheel(this.wheelId(), user.id).subscribe({
      next: () => {
        this.sharedWith.update((list) =>
          list.filter((u) => u.id !== user.id)
        );
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: 'Could not remove access',
        });
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/wheels']);
  }

  // ── Randomness ──
  /** Uniform float in [0, 1) backed by the Web Crypto CSPRNG. */
  private secureRandom(): number {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0x100000000;
  }

  /** Uniform integer in [0, maxExclusive) without modulo bias. */
  private secureRandomInt(maxExclusive: number): number {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    let value: number;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }

  // ── Spinning ──
  spin(): void {
    const segments = this.segments();
    if (this.isSpinning() || segments.length === 0) return;
    this.isSpinning.set(true);

    // Pick the winner up front with a uniform CSPRNG draw — the animation
    // then just travels to it, so easing/float math can never skew the odds.
    const winnerIndex = this.secureRandomInt(segments.length);
    const winner = segments[winnerIndex];

    // Land somewhere inside the winning segment, away from the edges so the
    // pointer never sits ambiguously on a boundary.
    const landingFraction = 0.1 + 0.8 * this.secureRandom();
    const landingAngle =
      winner.startAngle +
      landingFraction * (winner.endAngle - winner.startAngle);

    // Rotation that puts landingAngle under the pointer, plus full spins.
    const current = ((this.currentRotation % TAU) + TAU) % TAU;
    let delta = (POINTER_ANGLE - landingAngle - current) % TAU;
    if (delta < 0) delta += TAU;
    const fullSpins = 5 + this.secureRandomInt(4);
    const totalRotation = fullSpins * TAU + delta;

    const duration = 3800 + this.secureRandom() * 1400;
    const startTime = performance.now();
    const startRotation = this.currentRotation;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      this.currentRotation = startRotation + totalRotation * eased;
      this.drawWheel();

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.animationId = null;
        this.isSpinning.set(false);
        this.selectedItem.set(winner.text);
        this.showWinner.set(true);
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Spin & archive: the winner stays in the list but sits out future spins
   * until restored from the edit page. Persisted immediately.
   */
  archiveWinner(): void {
    const selected = this.selectedItem();
    if (selected) {
      let archived = false;
      this.items.update((list) =>
        list.map((item) => {
          if (!archived && item.enabled && item.label === selected) {
            archived = true;
            return { ...item, enabled: false };
          }
          return item;
        })
      );
      this.persist();
    }
    this.showWinner.set(false);
    this.selectedItem.set(null);
  }

  // ── Drawing ──
  private colorForItem(
    item: WheelItem,
    index: number,
    count: number
  ): string {
    if (item.tags.length > 0) {
      const tag = this.tags().find((t) => t.name === item.tags[0]);
      if (tag) return tag.color;
    }
    const hue = (index * 360) / count;
    return `hsl(${hue}, 70%, 60%)`;
  }

  /** Match the canvas backing store to the stage size (and screen DPI). */
  private sizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || !this.stageEl) return;

    const size = Math.max(
      200,
      Math.min(this.stageEl.clientWidth, this.stageEl.clientHeight)
    );
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    this.drawWheel();
  }

  private drawWheel(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const segments = this.segments();
    if (segments.length === 0) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = Math.min(centerX, centerY) - Math.max(12, size * 0.04);
    const fontSize = Math.max(11, Math.round(radius * 0.055));
    const maxChars = Math.max(10, Math.round(radius / (fontSize * 0.62)));

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.currentRotation);

    segments.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, segment.startAngle, segment.endAngle);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(2, radius * 0.01);
      ctx.stroke();

      ctx.save();
      const angle = (segment.startAngle + segment.endAngle) / 2;
      ctx.rotate(angle);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4;
      const text =
        segment.text.length > maxChars
          ? segment.text.slice(0, maxChars - 1) + '…'
          : segment.text;
      ctx.fillText(text, radius * 0.62, fontSize * 0.35);
      ctx.restore();
    });

    ctx.restore();

    // Center hub
    const hubRadius = Math.max(14, radius * 0.07);
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, TAU);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#11998e';
    ctx.lineWidth = Math.max(3, hubRadius * 0.2);
    ctx.stroke();

    // Pointer at the top
    const pointerHalf = Math.max(12, radius * 0.07);
    const pointerTip = centerY - radius + pointerHalf * 0.8;
    const pointerBase = centerY - radius - pointerHalf * 1.2;
    ctx.beginPath();
    ctx.moveTo(centerX, pointerTip);
    ctx.lineTo(centerX - pointerHalf, pointerBase);
    ctx.lineTo(centerX + pointerHalf, pointerBase);
    ctx.closePath();
    ctx.fillStyle = '#e8643c';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
