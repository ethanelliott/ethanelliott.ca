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
import { Activity, Expense, Trip } from '../../core/models';
import { formatDate, formatMoney } from '../../core/format';
import { zonedParts } from '../../core/tz';

const TYPES = [
  'FLIGHT',
  'HOTEL',
  'TRANSPORT',
  'TOUR',
  'ATTRACTION',
  'FOOD',
  'CREDIT',
  'OTHER',
];

interface ExpenseForm {
  id: string | null;
  item: string;
  type: string;
  amount: number | null;
  chargeDate: string;
  paid: boolean;
  activityId: string | null;
}

interface CashflowRow {
  expense: Expense;
  running: number;
}

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, Select, ConfirmDialog],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmdialog />

    <div class="page">
      <div class="head">
        <button class="back" (click)="back()"><i class="pi pi-arrow-left"></i></button>
        <h1 class="title">{{ trip()?.name }} · Budget</h1>
        <div class="spacer"></div>
        <p-button label="Add" icon="pi pi-plus" size="small" (onClick)="openCreate()" />
      </div>

      <!-- Summary -->
      <div class="cards">
        <div class="card stat">
          <div class="stat-label">Total</div>
          <div class="stat-value">{{ money(summary().total) }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Paid</div>
          <div class="stat-value paid">{{ money(summary().paid) }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Outstanding</div>
          <div class="stat-value owe">{{ money(summary().unpaid) }}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Per person ({{ memberCount() }})</div>
          <div class="stat-value">{{ money(summary().perPerson) }}</div>
        </div>
      </div>

      <!-- View switch -->
      <div class="view-switch">
        <button [class.active]="view() === 'items'" (click)="view.set('items')">By item</button>
        <button [class.active]="view() === 'cashflow'" (click)="view.set('cashflow')">Cash flow</button>
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (expenses().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-wallet"></i>
          <p class="muted">No budget items yet.</p>
        </div>
      } @else if (view() === 'items') {
        <div class="list">
          @for (e of expenses(); track e.id) {
            <div class="row card" (click)="openEdit(e)">
              <div class="row-main">
                <div class="row-item">
                  {{ e.item }}
                  <span class="type-chip">{{ e.type }}</span>
                </div>
                @if (e.activityTitle) {
                  <div class="row-link muted"><i class="pi pi-link"></i> {{ e.activityTitle }}</div>
                }
                <div class="row-sub muted">
                  {{ e.chargeDate ? formatDate(e.chargeDate) : 'No charge date' }}
                  · per person {{ money(perPerson(e.amountCents)) }}
                </div>
              </div>
              <div class="row-right">
                <div class="amount" [class.credit]="e.amountCents < 0">{{ money(e.amountCents) }}</div>
                <button
                  class="paid-toggle"
                  [class.is-paid]="e.paid"
                  (click)="togglePaid($event, e)"
                >
                  {{ e.paid ? 'Paid' : 'Unpaid' }}
                </button>
              </div>
            </div>
          }
        </div>
      } @else {
        <!-- Cash flow -->
        <div class="list">
          @for (r of cashflow(); track r.expense.id) {
            <div class="row card" (click)="openEdit(r.expense)">
              <div class="row-main">
                <div class="row-item">{{ r.expense.item }}</div>
                <div class="row-sub muted">{{ formatDate(r.expense.chargeDate) }} · {{ r.expense.type }}</div>
              </div>
              <div class="row-right">
                <div class="amount" [class.credit]="r.expense.amountCents < 0">{{ money(r.expense.amountCents) }}</div>
                <div class="running muted">Σ {{ money(r.running) }}</div>
              </div>
            </div>
          }
          @if (undated().length > 0) {
            <div class="section-title">No charge date</div>
            @for (e of undated(); track e.id) {
              <div class="row card" (click)="openEdit(e)">
                <div class="row-main"><div class="row-item">{{ e.item }}</div><div class="row-sub muted">{{ e.type }}</div></div>
                <div class="row-right"><div class="amount" [class.credit]="e.amountCents < 0">{{ money(e.amountCents) }}</div></div>
              </div>
            }
          }
        </div>
      }
    </div>

    <!-- Editor -->
    <p-dialog
      [(visible)]="editorVisible"
      [modal]="true"
      [draggable]="false"
      [header]="form.id ? 'Edit item' : 'New item'"
      [style]="{ width: '460px' }"
    >
      <div class="form">
        <div class="field">
          <label>Item</label>
          <input pInputText [(ngModel)]="form.item" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Type</label>
            <p-select [options]="types" [(ngModel)]="form.type" [editable]="true" appendTo="body" styleClass="w-full" />
          </div>
          <div class="field">
            <label>Amount ({{ trip()?.baseCurrency }})</label>
            <input type="number" step="0.01" [(ngModel)]="form.amount" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Charge date</label>
            <input type="date" [(ngModel)]="form.chargeDate" />
          </div>
          <div class="field">
            <label>Paid</label>
            <button class="paid-toggle big" [class.is-paid]="form.paid" (click)="form.paid = !form.paid" type="button">
              {{ form.paid ? 'Paid' : 'Unpaid' }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>Linked activity</label>
          <p-select
            [options]="activityOptions()"
            [(ngModel)]="form.activityId"
            optionLabel="label"
            optionValue="value"
            [showClear]="true"
            placeholder="None"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
      </div>
      <ng-template #footer>
        @if (form.id) {
          <p-button label="Delete" severity="danger" [text]="true" (onClick)="remove()" />
        }
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editorVisible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .head .title { font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .head .spacer { flex: 1; }
    .back { width: 34px; height: 34px; border: none; border-radius: 9px; background: var(--bg-subtle); cursor: pointer; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .stat { padding: 14px; }
    .stat-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
    .stat-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    .stat-value.paid { color: #1b9e77; }
    .stat-value.owe { color: #e8643c; }
    .view-switch { display: inline-flex; background: var(--bg-subtle); border-radius: 10px; padding: 3px; margin-bottom: 14px; }
    .view-switch button { border: none; background: transparent; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; color: var(--text-secondary); }
    .view-switch button.active { background: var(--bg-surface); color: var(--brand); box-shadow: var(--shadow-sm); }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; }
    .row:hover { box-shadow: var(--shadow-md); }
    .row-main { flex: 1; min-width: 0; }
    .row-item { font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .type-chip { font-size: 10px; font-weight: 700; background: var(--bg-subtle); color: var(--text-secondary); padding: 2px 6px; border-radius: 6px; text-transform: uppercase; }
    .row-link { font-size: 12px; }
    .row-link i { font-size: 10px; }
    .row-sub { font-size: 12px; }
    .row-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .amount { font-weight: 700; }
    .amount.credit { color: #1b9e77; }
    .running { font-size: 12px; }
    .paid-toggle { border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); border-radius: 999px; padding: 3px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .paid-toggle.is-paid { background: #e7f6f1; color: #1b9e77; border-color: #b6e3d4; }
    .paid-toggle.big { padding: 8px; border-radius: var(--radius-sm); }
    .form { display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .field input { width: 100%; }
    .field input[type='date'], .field input[type='number'] { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font: inherit; }
    .field-row { display: flex; gap: 12px; }
    .field-row .field { flex: 1; }
    .section-title { margin-top: 8px; }
    :host ::ng-deep .w-full { width: 100%; }
  `,
})
export class BudgetComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly id = input.required<string>();
  readonly types = TYPES;
  readonly formatDate = formatDate;

  readonly trip = signal<Trip | null>(null);
  readonly activities = signal<Activity[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly loading = signal(true);
  readonly view = signal<'items' | 'cashflow'>('items');

  readonly editorVisible = signal(false);
  readonly saving = signal(false);
  form: ExpenseForm = this.blankForm();

  readonly memberCount = computed(() =>
    Math.max(1, this.trip()?.members.length ?? 1)
  );

  readonly summary = computed(() => {
    const list = this.expenses();
    const total = list.reduce((s, e) => s + e.amountCents, 0);
    const paid = list.filter((e) => e.paid).reduce((s, e) => s + e.amountCents, 0);
    return {
      total,
      paid,
      unpaid: total - paid,
      perPerson: Math.round(total / this.memberCount()),
    };
  });

  readonly cashflow = computed<CashflowRow[]>(() => {
    const dated = this.expenses()
      .filter((e) => e.chargeDate)
      .sort((a, b) => (a.chargeDate! < b.chargeDate! ? -1 : 1));
    let running = 0;
    return dated.map((expense) => {
      running += expense.amountCents;
      return { expense, running };
    });
  });

  readonly undated = computed(() => this.expenses().filter((e) => !e.chargeDate));

  readonly activityOptions = computed(() => {
    const t = this.trip();
    const tz = t?.homeTimezone ?? 'UTC';
    return this.activities().map((a) => {
      const s = zonedParts(new Date(a.startAt), tz);
      const [, m, d] = s.date.split('-');
      return { label: `${a.title} (${m}/${d})`, value: a.id };
    });
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const tripId = this.id();
    this.api.getTrip(tripId).subscribe({
      next: (t) => {
        this.trip.set(t);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getActivities(tripId).subscribe((a) => this.activities.set(a));
    this.api.getExpenses(tripId).subscribe((e) => this.expenses.set(e));
  }

  private reload(): void {
    this.api.getExpenses(this.id()).subscribe((e) => this.expenses.set(e));
  }

  money(cents: number): string {
    return formatMoney(cents, this.trip()?.baseCurrency ?? 'CAD');
  }

  perPerson(cents: number): number {
    return Math.round(cents / this.memberCount());
  }

  back(): void {
    void this.router.navigate(['/trips', this.id()]);
  }

  private blankForm(): ExpenseForm {
    return {
      id: null,
      item: '',
      type: 'OTHER',
      amount: null,
      chargeDate: '',
      paid: false,
      activityId: null,
    };
  }

  openCreate(): void {
    this.form = this.blankForm();
    this.editorVisible.set(true);
  }

  openEdit(e: Expense): void {
    this.form = {
      id: e.id,
      item: e.item,
      type: e.type,
      amount: e.amountCents / 100,
      chargeDate: e.chargeDate ?? '',
      paid: e.paid,
      activityId: e.activityId,
    };
    this.editorVisible.set(true);
  }

  togglePaid(event: MouseEvent, e: Expense): void {
    event.stopPropagation();
    this.api.updateExpense(this.id(), e.id, { paid: !e.paid }).subscribe({
      next: () => this.reload(),
      error: (err) => this.error(err),
    });
  }

  save(): void {
    const f = this.form;
    if (!f.item.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Item required', detail: 'Name the budget item.' });
      return;
    }
    if (f.amount == null || Number.isNaN(f.amount)) {
      this.messages.add({ severity: 'warn', summary: 'Amount required', detail: 'Enter an amount.' });
      return;
    }

    const body = {
      item: f.item.trim(),
      type: (f.type || 'OTHER').trim(),
      amount: f.amount,
      chargeDate: f.chargeDate || null,
      paid: f.paid,
      activityId: f.activityId,
    };

    this.saving.set(true);
    const req = f.id
      ? this.api.updateExpense(this.id(), f.id, body)
      : this.api.createExpense(this.id(), body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.editorVisible.set(false);
        this.reload();
      },
      error: (e) => {
        this.saving.set(false);
        this.error(e);
      },
    });
  }

  remove(): void {
    const id = this.form.id;
    if (!id) return;
    this.confirm.confirm({
      header: 'Delete item',
      message: `Remove "${this.form.item}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteExpense(this.id(), id).subscribe({
          next: () => {
            this.editorVisible.set(false);
            this.reload();
          },
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
