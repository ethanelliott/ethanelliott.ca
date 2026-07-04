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
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ApiService } from '../../core/api.service';
import {
  PackingItem,
  PackingList,
  PackingTemplateSummary,
} from '../../core/models';

interface Group {
  id: string | null;
  name: string;
  color: string;
  items: PackingItem[];
}

@Component({
  selector: 'app-packing',
  standalone: true,
  imports: [
    FormsModule,
    Button,
    Dialog,
    InputText,
    Select,
    ConfirmDialog,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="page">
      <div class="head">
        <h1 class="title">{{ tripName() }} · Packing</h1>
        <div class="spacer"></div>
        <p-button icon="pi pi-box" label="Bags" size="small" severity="secondary" [outlined]="true" (onClick)="containerDialog.set(true)" />
        <p-button icon="pi pi-bookmark" label="Templates" size="small" severity="secondary" [outlined]="true" (onClick)="openTemplates()" />
      </div>

      <!-- Progress -->
      <div class="progress card">
        <div class="prog-stat"><span class="n">{{ counts().total }}</span> items</div>
        <div class="prog-bars">
          <div class="bar"><span>Ready</span><div class="track"><div class="fill ready" [style.width.%]="pct(counts().ready)"></div></div><b>{{ counts().ready }}</b></div>
          <div class="bar"><span>Packed</span><div class="track"><div class="fill packed" [style.width.%]="pct(counts().packed)"></div></div><b>{{ counts().packed }}</b></div>
          <div class="bar"><span>Verify</span><div class="track"><div class="fill verify" [style.width.%]="pct(counts().verify)"></div></div><b>{{ counts().verify }}</b></div>
        </div>
      </div>

      <!-- Add item -->
      <div class="add-row card">
        <input pInputText placeholder="Add an item…" [(ngModel)]="newItem" (keyup.enter)="addItem()" />
        <input class="count" type="number" min="1" [(ngModel)]="newCount" />
        <p-select [options]="containerOptions()" [(ngModel)]="newContainerId" optionLabel="label" optionValue="value" placeholder="Bag" [showClear]="true" appendTo="body" styleClass="bag-select" />
        <p-button icon="pi pi-plus" [loading]="adding()" (onClick)="addItem()" />
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (counts().total === 0) {
        <div class="empty-state card"><i class="pi pi-briefcase"></i><p class="muted">Nothing packed yet. Add items, or apply a template.</p></div>
      } @else {
        @for (g of groups(); track g.id) {
          @if (g.items.length > 0) {
            <div class="group">
              <div class="group-head"><span class="dot" [style.background]="g.color"></span>{{ g.name }} <span class="muted">· {{ g.items.length }}</span></div>
              @for (it of g.items; track it.id) {
                <div class="item card">
                  <div class="item-name">
                    @if (it.count > 1) { <span class="count-badge">{{ it.count }}</span> }
                    {{ it.name }}
                  </div>
                  <div class="stages">
                    <button class="stage" [class.on]="it.ready" (click)="toggle(it, 'ready')" title="Ready">R</button>
                    <button class="stage" [class.on]="it.packed" [disabled]="!it.ready" (click)="toggle(it, 'packed')" title="Packed">P</button>
                    <button class="stage" [class.on]="it.verify" [disabled]="!it.packed" (click)="toggle(it, 'verify')" title="Verify">V</button>
                  </div>
                  <button class="icon-btn" (click)="openEdit(it)"><i class="pi pi-pencil"></i></button>
                  <button class="icon-btn danger" (click)="removeItem(it)"><i class="pi pi-trash"></i></button>
                </div>
              }
            </div>
          }
        }
      }
    </div>

    <!-- Item edit -->
    <p-dialog [(visible)]="editVisible" [modal]="true" [draggable]="false" header="Edit item" [style]="{ width: 'min(420px, 92vw)' }">
      <div class="form">
        <div class="field"><label>Name</label><input pInputText [(ngModel)]="editForm.name" /></div>
        <div class="field-row">
          <div class="field"><label>Count</label><input type="number" min="1" [(ngModel)]="editForm.count" /></div>
          <div class="field"><label>Bag</label>
            <p-select [options]="containerOptions()" [(ngModel)]="editForm.containerId" optionLabel="label" optionValue="value" [showClear]="true" placeholder="None" appendTo="body" styleClass="w-full" />
          </div>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" (onClick)="saveEdit()" />
      </ng-template>
    </p-dialog>

    <!-- Container manager -->
    <p-dialog [(visible)]="containerDialog" [modal]="true" [draggable]="false" header="Bags & containers" [style]="{ width: 'min(400px, 92vw)' }">
      <div class="tag-list">
        @for (c of list()?.containers ?? []; track c.id) {
          <div class="tag-row"><span class="tag-dot" [style.background]="c.color"></span><span class="tag-name">{{ c.name }}</span>
            <button class="icon-btn danger" (click)="removeContainer(c.id)"><i class="pi pi-trash"></i></button>
          </div>
        } @empty { <p class="muted">No containers yet.</p> }
      </div>
      <div class="add-tag">
        <input type="color" [(ngModel)]="newContainerColor" />
        <input pInputText placeholder="New bag (e.g. DAYPACK)" [(ngModel)]="newContainerName" (keyup.enter)="addContainer()" />
        <p-button icon="pi pi-plus" (onClick)="addContainer()" />
      </div>
    </p-dialog>

    <!-- Templates -->
    <p-dialog [(visible)]="templateDialog" [modal]="true" [draggable]="false" header="Packing templates" [style]="{ width: 'min(440px, 92vw)' }">
      <div class="tag-list">
        @for (t of templates(); track t.id) {
          <div class="tag-row">
            <span class="tag-name">{{ t.name }} <span class="muted">· {{ t.itemCount }} items</span></span>
            <p-button label="Apply" size="small" [text]="true" (onClick)="applyTemplate(t)" />
            <button class="icon-btn danger" (click)="deleteTemplate(t)"><i class="pi pi-trash"></i></button>
          </div>
        } @empty { <p class="muted">No saved templates.</p> }
      </div>
      <div class="add-tag">
        <input pInputText placeholder="Save current list as…" [(ngModel)]="newTemplateName" (keyup.enter)="saveTemplate()" />
        <p-button label="Save" icon="pi pi-bookmark" (onClick)="saveTemplate()" />
      </div>
    </p-dialog>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .head .title { font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .head .spacer { flex: 1; }
    .back { width: 34px; height: 34px; border: none; border-radius: 9px; background: var(--bg-subtle); cursor: pointer; }
    .progress { padding: 14px; margin-bottom: 12px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
    .prog-stat .n { font-size: 22px; font-weight: 700; }
    .prog-bars { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
    .bar { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .bar span { width: 48px; color: var(--text-secondary); }
    .bar b { width: 28px; text-align: right; }
    .track { flex: 1; height: 8px; background: var(--bg-subtle); border-radius: 4px; overflow: hidden; }
    .fill { height: 100%; }
    .fill.ready { background: #f0b429; }
    .fill.packed { background: #4f46e5; }
    .fill.verify { background: #1b9e77; }
    .add-row { display: flex; gap: 8px; padding: 10px; margin-bottom: 14px; align-items: center; }
    .add-row input[pInputText] { flex: 1; }
    .add-row .count { width: 60px; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font: inherit; }
    .group { margin-bottom: 14px; }
    .group-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; margin: 8px 4px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 6px; }
    .item-name { flex: 1; display: flex; align-items: center; gap: 8px; }
    .count-badge { background: var(--bg-subtle); border-radius: 6px; padding: 1px 7px; font-size: 12px; font-weight: 700; }
    .stages { display: flex; gap: 4px; }
    .stage { width: 30px; height: 30px; border: 1px solid var(--border); background: var(--bg-surface); border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; color: var(--text-muted); }
    .stage.on { background: var(--brand); color: #fff; border-color: var(--brand); }
    .stage:disabled { opacity: 0.4; cursor: not-allowed; }
    .icon-btn { width: 30px; height: 30px; border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-secondary); }
    .icon-btn.danger { color: #e8643c; }
    .form { display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .field input { width: 100%; }
    .field input[type='number'] { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font: inherit; }
    .field-row { display: flex; gap: 12px; } .field-row .field { flex: 1; }
    .tag-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .tag-row { display: flex; align-items: center; gap: 8px; }
    .tag-dot { width: 14px; height: 14px; border-radius: 50%; }
    .tag-name { flex: 1; }
    .add-tag { display: flex; gap: 8px; align-items: center; }
    .add-tag input[pInputText] { flex: 1; }
    .add-tag input[type='color'] { width: 38px; height: 38px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; }
    :host ::ng-deep .w-full, :host ::ng-deep .bag-select { width: 100%; }
    :host ::ng-deep .bag-select { min-width: 120px; }
  `,
})
export class PackingComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly id = input.required<string>();

  readonly list = signal<PackingList | null>(null);
  readonly templates = signal<PackingTemplateSummary[]>([]);
  readonly loading = signal(true);
  readonly adding = signal(false);

  newItem = '';
  newCount = 1;
  newContainerId: string | null = null;

  readonly containerDialog = signal(false);
  newContainerName = '';
  newContainerColor = '#4f46e5';

  readonly templateDialog = signal(false);
  newTemplateName = '';

  readonly editVisible = signal(false);
  editForm = { id: '', name: '', count: 1, containerId: null as string | null };

  readonly tripName = signal('');

  readonly containerOptions = computed(() =>
    (this.list()?.containers ?? []).map((c) => ({ label: c.name, value: c.id }))
  );

  readonly groups = computed<Group[]>(() => {
    const l = this.list();
    if (!l) return [];
    const groups: Group[] = l.containers.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      items: l.items
        .filter((i) => i.containerId === c.id)
        .sort((a, b) => a.position - b.position),
    }));
    const unsorted = l.items
      .filter((i) => i.containerId === null)
      .sort((a, b) => a.position - b.position);
    if (unsorted.length) {
      groups.push({ id: null, name: 'Unsorted', color: '#9aa1ad', items: unsorted });
    }
    return groups;
  });

  readonly counts = computed(() => {
    const items = this.list()?.items ?? [];
    return {
      total: items.length,
      ready: items.filter((i) => i.ready).length,
      packed: items.filter((i) => i.packed).length,
      verify: items.filter((i) => i.verify).length,
    };
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getPackingList(this.id()).subscribe({
      next: (l) => {
        this.list.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getTrip(this.id()).subscribe((t) => this.tripName.set(t.name));
  }

  pct(n: number): number {
    const total = this.counts().total;
    return total ? (n / total) * 100 : 0;
  }

  back(): void {
    void this.router.navigate(['/trips', this.id()]);
  }

  addItem(): void {
    const name = this.newItem.trim();
    if (!name) return;
    this.adding.set(true);
    this.api
      .addPackingItem(this.id(), {
        name,
        count: this.newCount || 1,
        containerId: this.newContainerId,
      })
      .subscribe({
        next: (l) => {
          this.list.set(l);
          this.newItem = '';
          this.newCount = 1;
          this.adding.set(false);
        },
        error: (e) => {
          this.adding.set(false);
          this.error(e);
        },
      });
  }

  toggle(item: PackingItem, stage: 'ready' | 'packed' | 'verify'): void {
    this.api
      .updatePackingItem(this.id(), item.id, { [stage]: !item[stage] })
      .subscribe({ next: (l) => this.list.set(l), error: (e) => this.error(e) });
  }

  openEdit(item: PackingItem): void {
    this.editForm = {
      id: item.id,
      name: item.name,
      count: item.count,
      containerId: item.containerId,
    };
    this.editVisible.set(true);
  }

  saveEdit(): void {
    const f = this.editForm;
    if (!f.name.trim()) return;
    this.api
      .updatePackingItem(this.id(), f.id, {
        name: f.name.trim(),
        count: f.count || 1,
        containerId: f.containerId,
      })
      .subscribe({
        next: (l) => {
          this.list.set(l);
          this.editVisible.set(false);
        },
        error: (e) => this.error(e),
      });
  }

  removeItem(item: PackingItem): void {
    this.api.deletePackingItem(this.id(), item.id).subscribe({
      next: (l) => this.list.set(l),
      error: (e) => this.error(e),
    });
  }

  // ── Containers ──
  addContainer(): void {
    const name = this.newContainerName.trim();
    if (!name) return;
    this.api
      .addContainer(this.id(), { name, color: this.newContainerColor })
      .subscribe({
        next: (l) => {
          this.list.set(l);
          this.newContainerName = '';
        },
        error: (e) => this.error(e),
      });
  }

  removeContainer(containerId: string): void {
    this.api.deleteContainer(this.id(), containerId).subscribe({
      next: (l) => this.list.set(l),
      error: (e) => this.error(e),
    });
  }

  // ── Templates ──
  openTemplates(): void {
    this.api.getPackingTemplates().subscribe((t) => this.templates.set(t));
    this.templateDialog.set(true);
  }

  saveTemplate(): void {
    const name = this.newTemplateName.trim();
    if (!name) return;
    this.api.savePackingTemplate(this.id(), name).subscribe({
      next: () => {
        this.newTemplateName = '';
        this.api.getPackingTemplates().subscribe((t) => this.templates.set(t));
        this.messages.add({ severity: 'success', summary: 'Saved', detail: 'Template saved.' });
      },
      error: (e) => this.error(e),
    });
  }

  applyTemplate(t: PackingTemplateSummary): void {
    this.api.applyPackingTemplate(this.id(), t.id).subscribe({
      next: (l) => {
        this.list.set(l);
        this.templateDialog.set(false);
      },
      error: (e) => this.error(e),
    });
  }

  deleteTemplate(t: PackingTemplateSummary): void {
    this.confirm.confirm({
      header: 'Delete template',
      message: `Delete "${t.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deletePackingTemplate(t.id).subscribe({
          next: () =>
            this.api.getPackingTemplates().subscribe((x) => this.templates.set(x)),
          error: (e) => this.error(e),
        });
      },
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
