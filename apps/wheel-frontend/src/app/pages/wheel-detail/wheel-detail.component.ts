import {
  Component,
  ElementRef,
  Input,
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
import { WheelItem, WheelTag } from '../../core/models';

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

@Component({
  selector: 'app-wheel-detail',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, MultiSelect],
  template: `
    <div class="page">
      <div class="page-head">
        <button class="back-btn" (click)="goBack()" aria-label="Back">
          <i class="pi pi-arrow-left"></i>
        </button>
        <input
          class="name-input"
          pInputText
          [(ngModel)]="nameModel"
          (ngModelChange)="markDirty()"
          placeholder="Wheel name"
        />
        <p-button
          label="Save"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="!dirty()"
          (onClick)="save()"
        />
      </div>

      <div class="layout">
        <!-- ── Wheel ── -->
        <div class="wheel-pane card">
          @if (segments().length > 0) {
            <canvas
              #canvas
              width="640"
              height="640"
              class="wheel-canvas"
            ></canvas>
          } @else {
            <div class="empty-state">
              <i class="pi pi-bullseye"></i>
              <p>Add some items to spin.</p>
              @if (items().length > 0 && filteredItems().length === 0) {
                <p class="muted">No items match the active tag filter.</p>
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

        <!-- ── Editor ── -->
        <div class="editor-pane">
          @if (tags().length > 0) {
            <div class="card section">
              <div class="section-head">
                <span>Filter by tag</span>
                @if (activeFilters().length > 0) {
                  <button class="link-btn" (click)="clearFilters()">
                    Clear
                  </button>
                }
              </div>
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
              </div>
            </div>
          }

          <div class="card section">
            <div class="section-head">
              <span>Items ({{ items().length }})</span>
              <button class="link-btn" (click)="addItem()">
                <i class="pi pi-plus"></i> Add
              </button>
            </div>

            @if (items().length === 0) {
              <p class="muted hint">No items yet — add your options here.</p>
            }

            @for (item of items(); track $index) {
              <div class="item-row">
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
              <p-button
                icon="pi pi-plus"
                [text]="true"
                (onClick)="addTag()"
              />
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
      </div>
    </div>

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
            label="Remove from wheel"
            severity="danger"
            [outlined]="true"
            (onClick)="removeWinner()"
          />
          <p-button label="Keep & close" (onClick)="showWinner.set(false)" />
        </div>
      </div>
    </p-dialog>
  `,
  styles: `
    .page-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .back-btn {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      border-radius: 10px;
      color: var(--text-primary);
      cursor: pointer;
    }
    .name-input {
      flex: 1;
      min-width: 0;
      font-weight: 600;
    }
    .layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    @media (min-width: 900px) {
      .layout {
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
        align-items: start;
      }
    }
    .wheel-pane {
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      position: sticky;
      top: calc(var(--header-height) + 16px);
    }
    .wheel-canvas {
      max-width: 100%;
      height: auto;
    }
    :host ::ng-deep .spin-btn {
      width: 100%;
      max-width: 360px;
    }
    .editor-pane {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .section {
      padding: 14px 16px;
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
    .hint {
      font-size: 13px;
    }
    .filter-row,
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
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
    :host ::ng-deep .winner-actions .p-button {
      width: 100%;
      justify-content: center;
    }
  `,
})
export class WheelDetailComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  // Route param (component input binding).
  @Input() set id(value: string) {
    this.wheelId.set(value);
    this.load(value);
  }

  private readonly wheelId = signal<string>('');

  nameModel = '';
  newTagName = '';

  readonly items = signal<WheelItem[]>([]);
  readonly tags = signal<WheelTag[]>([]);
  readonly activeFilters = signal<string[]>([]);
  readonly dirty = signal(false);
  readonly saving = signal(false);

  readonly isSpinning = signal(false);
  readonly selectedItem = signal<string | null>(null);
  readonly showWinner = signal(false);

  private currentRotation = 0;
  private animationId: number | null = null;

  readonly filteredItems = computed<WheelItem[]>(() => {
    const filters = this.activeFilters();
    const items = this.items().filter((i) => i.label.trim() !== '');
    if (filters.length === 0) return items;
    return items.filter((i) => i.tags.some((t) => filters.includes(t)));
  });

  readonly segments = computed<WheelSegment[]>(() => {
    const items = this.filteredItems();
    if (items.length === 0) return [];

    const anglePerSegment = (2 * Math.PI) / items.length;
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
      const segs = this.segments();
      if (segs.length > 0) {
        setTimeout(() => this.drawWheel(), 0);
      }
    });
  }

  private load(id: string): void {
    this.api.getWheel(id).subscribe({
      next: (wheel) => {
        this.nameModel = wheel.name;
        this.tags.set(wheel.tags);
        this.items.set(
          wheel.items.map((i) => ({ label: i.label, tags: [...i.tags] }))
        );
        this.activeFilters.set([]);
        this.dirty.set(false);
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: 'Could not load wheel',
        });
        this.router.navigate(['/wheels']);
      },
    });
  }

  // ── Editing ──
  markDirty(): void {
    this.dirty.set(true);
  }

  setItemLabel(index: number, label: string): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, label } : item))
    );
    this.markDirty();
  }

  setItemTags(index: number, tags: string[]): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, tags } : item))
    );
    this.markDirty();
  }

  addItem(): void {
    this.items.update((list) => [...list, { label: '', tags: [] }]);
    this.markDirty();
  }

  removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
    this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
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

  // ── Saving ──
  save(): void {
    const items = this.items()
      .filter((i) => i.label.trim() !== '')
      .map((i) => ({ label: i.label.trim(), tags: i.tags }));

    this.saving.set(true);
    this.api
      .saveWheel(this.wheelId(), {
        name: this.nameModel.trim() || 'Untitled wheel',
        tags: this.tags(),
        items,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty.set(false);
          this.messages.add({ severity: 'success', summary: 'Saved' });
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

  goBack(): void {
    this.router.navigate(['/wheels']);
  }

  // ── Spinning ──
  spin(): void {
    if (this.isSpinning() || this.segments().length === 0) return;
    this.isSpinning.set(true);

    const minSpins = 5;
    const maxSpins = 8;
    const spins = minSpins + Math.random() * (maxSpins - minSpins);
    const extraRotation = Math.random() * 2 * Math.PI;
    const totalRotation = spins * 2 * Math.PI + extraRotation;

    const duration = 4000;
    const startTime = performance.now();
    const startRotation = this.currentRotation;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.currentRotation = startRotation + totalRotation * eased;
      this.drawWheel();

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.isSpinning.set(false);
        this.determineWinner();
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  private determineWinner(): void {
    const segments = this.segments();
    if (segments.length === 0) return;

    const normalizedRotation = this.currentRotation % (2 * Math.PI);
    const pointerAngle =
      ((3 * Math.PI) / 2 - normalizedRotation) % (2 * Math.PI);
    const adjustedAngle =
      pointerAngle < 0 ? pointerAngle + 2 * Math.PI : pointerAngle;

    for (const segment of segments) {
      if (
        adjustedAngle >= segment.startAngle &&
        adjustedAngle < segment.endAngle
      ) {
        this.selectedItem.set(segment.text);
        this.showWinner.set(true);
        break;
      }
    }
  }

  removeWinner(): void {
    const selected = this.selectedItem();
    if (selected) {
      this.items.update((list) =>
        list.filter((item) => item.label !== selected)
      );
      this.markDirty();
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

  private drawWheel(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const segments = this.segments();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (segments.length === 0) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 12;

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
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      const angle = (segment.startAngle + segment.endAngle) / 2;
      ctx.rotate(angle);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Inter, Arial, sans-serif';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4;
      const text =
        segment.text.length > 18
          ? segment.text.slice(0, 17) + '…'
          : segment.text;
      ctx.fillText(text, radius * 0.62, 5);
      ctx.restore();
    });

    ctx.restore();

    // Center hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 22, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#11998e';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Pointer at the top
    const pointerTip = centerY - radius + 18;
    const pointerBase = centerY - radius - 26;
    ctx.beginPath();
    ctx.moveTo(centerX, pointerTip);
    ctx.lineTo(centerX - 22, pointerBase);
    ctx.lineTo(centerX + 22, pointerBase);
    ctx.closePath();
    ctx.fillStyle = '#e8643c';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
