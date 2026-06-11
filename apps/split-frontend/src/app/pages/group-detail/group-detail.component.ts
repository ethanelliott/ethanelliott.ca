import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Avatar } from 'primeng/avatar';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  Expense,
  Group,
  GroupBalances,
  Settlement,
  SplitType,
} from '../../core/models';
import { MoneyPipe } from '../../core/money.pipe';

interface SplitRow {
  userId: string;
  name: string;
  included: boolean;
  value: number | null; // dollars for exact, percent for percentage
}

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    Button,
    Dialog,
    InputText,
    InputNumber,
    Select,
    SelectButton,
    Avatar,
    MoneyPipe,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (group(); as g) {
    <div class="detail-header">
      <div class="page detail-header-inner">
        <button class="back-btn" (click)="back()">
          <i class="pi pi-arrow-left"></i>
        </button>
        <div class="title-block">
          <h1>{{ g.name }}</h1>
          <span class="members-line">{{ memberNames() }}</span>
        </div>
        <button class="icon-btn" (click)="openMembers()">
          <i class="pi pi-user-plus"></i>
        </button>
      </div>

      <div class="page tabs">
        <button
          [class.active]="tab() === 'expenses'"
          (click)="tab.set('expenses')"
        >
          Expenses
        </button>
        <button
          [class.active]="tab() === 'balances'"
          (click)="tab.set('balances')"
        >
          Balances
        </button>
      </div>
    </div>

    <div class="page">
      @if (tab() === 'expenses') { @if (expenses().length === 0) {
      <div class="empty-state card">
        <i class="pi pi-receipt"></i>
        <p>No expenses yet. Add the first one.</p>
      </div>
      } @else {
      <div class="rows card">
        @for (e of expenses(); track e.id) {
        <div class="expense-row" (click)="editExpense(e)">
          <div class="exp-date">
            <span class="mon">{{ e.date | date : 'MMM' }}</span>
            <span class="day">{{ e.date | date : 'd' }}</span>
          </div>
          <div class="exp-main">
            <span class="exp-desc">{{ e.description }}</span>
            <span class="exp-sub"
              >{{ e.paidBy.name }} paid
              {{ e.amountCents | money : e.currency }}</span
            >
          </div>
          <div class="exp-share">{{ shareLabel(e) }}</div>
        </div>
        }
      </div>
      } } @else {
      <!-- Balances tab -->
      @if (balances(); as b) { @if (b.debts.length === 0) {
      <div class="empty-state card">
        <i class="pi pi-check-circle" style="color: var(--brand)"></i>
        <p>Everyone is settled up!</p>
      </div>
      } @else {
      <div class="rows card">
        @for (d of b.debts; track d.from.id + d.to.id) {
        <div class="debt-row">
          <span class="debt-text">
            <strong>{{ youOrName(d.from) }}</strong> owe{{
              d.from.id === myId() ? '' : 's'
            }}
            <strong>{{ youOrName(d.to) }}</strong>
          </span>
          <span class="debt-actions">
            <span class="amount-negative">{{
              d.amountCents | money : b.currency
            }}</span>
            <p-button
              label="Settle"
              size="small"
              [text]="true"
              (onClick)="openSettle(d.from.id, d.to.id, d.amountCents)"
            />
          </span>
        </div>
        }
      </div>
      }

      <h2 class="section-title">Member balances</h2>
      <div class="rows card">
        @for (m of b.balances; track m.user.id) {
        <div class="balance-row">
          <p-avatar
            [label]="initial(m.user.name)"
            shape="circle"
            styleClass="member-avatar"
          />
          <span class="bal-name">{{ youOrName(m.user) }}</span>
          @if (m.netCents === 0) {
          <span class="muted">settled</span>
          } @else if (m.netCents > 0) {
          <span class="amount-positive"
            >gets back {{ m.netCents | money : b.currency }}</span
          >
          } @else {
          <span class="amount-negative"
            >owes {{ -m.netCents | money : b.currency }}</span
          >
          }
        </div>
        }
      </div>
      } }
    </div>

    <!-- FAB add expense -->
    <p-button
      class="fab"
      icon="pi pi-plus"
      [rounded]="true"
      size="large"
      (onClick)="openExpense()"
    />
    } @else {
    <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
    }

    <!-- Add / edit expense dialog -->
    <p-dialog
      [header]="editingId() ? 'Edit expense' : 'Add expense'"
      [(visible)]="showExpense"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '94vw', maxWidth: '600px' }"
    >
      <div class="dialog-body">
        <div class="field">
          <label>Description</label>
          <input
            pInputText
            [(ngModel)]="expDesc"
            placeholder="Dinner, groceries…"
          />
        </div>
        <div class="two-col">
          <div class="field">
            <label>Amount</label>
            <p-inputNumber
              [(ngModel)]="expAmount"
              mode="currency"
              [currency]="group()?.currency || 'CAD'"
              [min]="0"
            />
          </div>
          <div class="field">
            <label>Paid by</label>
            <p-select
              [options]="memberOptions()"
              [(ngModel)]="expPaidBy"
              optionLabel="name"
              optionValue="userId"
              appendTo="body"
            />
          </div>
        </div>

        <div class="field">
          <label>Split</label>
          <p-selectButton
            [options]="splitOptions"
            [(ngModel)]="expSplitType"
            optionLabel="label"
            optionValue="value"
            [allowEmpty]="false"
          />
        </div>

        <div class="splits">
          @for (row of splitRows(); track row.userId) {
          <div class="split-row" [class.off]="!row.included">
            <label class="split-check">
              <input type="checkbox" [(ngModel)]="row.included" />
              <span>{{ row.name }}</span>
            </label>
            @if (expSplitType !== 'equal' && row.included) {
            <p-inputNumber
              [(ngModel)]="row.value"
              [min]="0"
              [suffix]="expSplitType === 'percentage' ? ' %' : ''"
              [mode]="expSplitType === 'exact' ? 'currency' : 'decimal'"
              [currency]="group()?.currency || 'CAD'"
              styleClass="split-input"
            />
            }
          </div>
          }
          <small class="split-hint">{{ splitHint() }}</small>
        </div>
      </div>
      <ng-template #footer>
        @if (editingId()) {
        <p-button
          label="Delete"
          severity="danger"
          [text]="true"
          (onClick)="deleteExpense()"
        />
        }
        <p-button
          label="Cancel"
          [text]="true"
          (onClick)="showExpense.set(false)"
        />
        <p-button
          label="Save"
          [loading]="savingExpense()"
          (onClick)="saveExpense()"
        />
      </ng-template>
    </p-dialog>

    <!-- Settle up dialog -->
    <p-dialog
      header="Record a payment"
      [(visible)]="showSettle"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '92vw', maxWidth: '500px' }"
    >
      <div class="dialog-body">
        <div class="two-col">
          <div class="field">
            <label>From</label>
            <p-select
              [options]="memberOptions()"
              [(ngModel)]="settleFrom"
              optionLabel="name"
              optionValue="userId"
              appendTo="body"
            />
          </div>
          <div class="field">
            <label>To</label>
            <p-select
              [options]="memberOptions()"
              [(ngModel)]="settleTo"
              optionLabel="name"
              optionValue="userId"
              appendTo="body"
            />
          </div>
        </div>
        <div class="field">
          <label>Amount</label>
          <p-inputNumber
            [(ngModel)]="settleAmount"
            mode="currency"
            [currency]="group()?.currency || 'CAD'"
            [min]="0"
          />
        </div>
      </div>
      <ng-template #footer>
        <p-button
          label="Cancel"
          [text]="true"
          (onClick)="showSettle.set(false)"
        />
        <p-button
          label="Save payment"
          [loading]="savingSettle()"
          (onClick)="saveSettle()"
        />
      </ng-template>
    </p-dialog>

    <!-- Members dialog -->
    <p-dialog
      header="Members"
      [(visible)]="showMembers"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '92vw', maxWidth: '500px' }"
    >
      <div class="dialog-body">
        <div class="member-list">
          @for (m of group()?.members || []; track m.id) {
          <div class="member-item">
            <p-avatar [label]="initial(m.user.name)" shape="circle" />
            <div class="member-meta">
              <span>{{ m.user.name }}</span>
              <small>{{ '@' + m.user.username }}</small>
            </div>
          </div>
          }
        </div>
        <div class="field">
          <label>Add by username</label>
          <div class="add-member-row">
            <input
              pInputText
              [(ngModel)]="newMemberUsername"
              placeholder="username"
              autocapitalize="none"
            />
            <p-button
              icon="pi pi-plus"
              [loading]="addingMember()"
              (onClick)="addMember()"
            />
          </div>
        </div>
        <p-button
          label="Delete group"
          severity="danger"
          [text]="true"
          icon="pi pi-trash"
          (onClick)="deleteGroup()"
        />
      </div>
    </p-dialog>
  `,
  styleUrl: './group-detail.component.scss',
})
export class GroupDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  // Bound from the route param via withComponentInputBinding.
  readonly id = input.required<string>();

  readonly group = signal<Group | null>(null);
  readonly expenses = signal<Expense[]>([]);
  readonly settlements = signal<Settlement[]>([]);
  readonly balances = signal<GroupBalances | null>(null);
  readonly tab = signal<'expenses' | 'balances'>('expenses');

  readonly myId = computed(() => this.auth.profile()?.id ?? '');

  // Expense dialog state
  readonly showExpense = signal(false);
  readonly savingExpense = signal(false);
  readonly editingId = signal<string | null>(null);
  expDesc = '';
  expAmount: number | null = null;
  expPaidBy = '';
  expSplitType: SplitType = 'equal';
  readonly splitRows = signal<SplitRow[]>([]);
  readonly splitOptions = [
    { label: 'Equally', value: 'equal' },
    { label: 'Exact', value: 'exact' },
    { label: 'Percent', value: 'percentage' },
  ];

  // Settle dialog state
  readonly showSettle = signal(false);
  readonly savingSettle = signal(false);
  settleFrom = '';
  settleTo = '';
  settleAmount: number | null = null;

  // Members dialog state
  readonly showMembers = signal(false);
  readonly addingMember = signal(false);
  newMemberUsername = '';

  readonly memberOptions = computed(() =>
    (this.group()?.members ?? []).map((m) => ({
      userId: m.user.id,
      name: m.user.name,
    }))
  );

  constructor() {
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
  }

  ngOnInit(): void {
    // Route param inputs are bound by the time ngOnInit runs.
    this.reload();
  }

  reload(): void {
    const id = this.id();
    this.api.getGroup(id).subscribe((g) => this.group.set(g));
    this.api.getExpenses(id).subscribe((e) => this.expenses.set(e));
    this.api.getBalances(id).subscribe((b) => this.balances.set(b));
  }

  back(): void {
    this.router.navigate(['/groups']);
  }

  initial(name: string): string {
    return (name?.charAt(0) || '?').toUpperCase();
  }

  memberNames(): string {
    return (this.group()?.members ?? []).map((m) => m.user.name).join(', ');
  }

  youOrName(user: { id: string; name: string }): string {
    return user.id === this.myId() ? 'You' : user.name;
  }

  /** A short label for what the current user owes/lent on a given expense. */
  shareLabel(e: Expense): string {
    const mine = e.splits.find((s) => s.user.id === this.myId());
    if (e.paidBy.id === this.myId()) {
      const lent = e.amountCents - (mine?.amountCents ?? 0);
      return lent > 0 ? 'you lent' : '';
    }
    return mine ? 'you owe' : '';
  }

  // ── Expense dialog ──
  private buildSplitRows(selected?: Expense): void {
    const members = this.group()?.members ?? [];
    const selectedIds = selected
      ? new Set(selected.splits.map((s) => s.user.id))
      : new Set(members.map((m) => m.user.id));
    this.splitRows.set(
      members.map((m) => {
        const existing = selected?.splits.find((s) => s.user.id === m.user.id);
        let value: number | null = null;
        if (selected && existing) {
          value =
            selected.splitType === 'percentage'
              ? Math.round((existing.amountCents / selected.amountCents) * 100)
              : existing.amountCents / 100;
        }
        return {
          userId: m.user.id,
          name: m.user.name,
          included: selectedIds.has(m.user.id),
          value,
        };
      })
    );
  }

  openExpense(): void {
    this.editingId.set(null);
    this.expDesc = '';
    this.expAmount = null;
    this.expPaidBy = this.myId() || this.memberOptions()[0]?.userId || '';
    this.expSplitType = 'equal';
    this.buildSplitRows();
    this.showExpense.set(true);
  }

  editExpense(e: Expense): void {
    this.editingId.set(e.id);
    this.expDesc = e.description;
    this.expAmount = e.amountCents / 100;
    this.expPaidBy = e.paidBy.id;
    this.expSplitType = (e.splitType as SplitType) ?? 'equal';
    this.buildSplitRows(e);
    this.showExpense.set(true);
  }

  splitHint(): string {
    const included = this.splitRows().filter((r) => r.included);
    if (this.expSplitType === 'equal') {
      return `Split equally between ${included.length} member${
        included.length === 1 ? '' : 's'
      }.`;
    }
    if (this.expSplitType === 'percentage') {
      const total = included.reduce((acc, r) => acc + (r.value ?? 0), 0);
      return `Percentages add up to ${total}% (must be 100%).`;
    }
    const total = included.reduce((acc, r) => acc + (r.value ?? 0), 0);
    return `Shares add up to ${total.toFixed(2)} (must equal the amount).`;
  }

  saveExpense(): void {
    const desc = this.expDesc.trim();
    const amount = this.expAmount ?? 0;
    const included = this.splitRows().filter((r) => r.included);
    if (!desc || amount <= 0 || included.length === 0 || !this.expPaidBy) {
      this.messages.add({
        severity: 'warn',
        summary: 'Incomplete',
        detail: 'Enter a description, amount, payer and at least one member.',
      });
      return;
    }

    const body = {
      description: desc,
      amount,
      currency: this.group()?.currency || 'CAD',
      paidByUserId: this.expPaidBy,
      splitType: this.expSplitType,
      splits: included.map((r) => ({
        userId: r.userId,
        value: this.expSplitType === 'equal' ? undefined : r.value ?? 0,
      })),
    };

    this.savingExpense.set(true);
    const editId = this.editingId();
    const request$ = editId
      ? this.api.updateExpense(editId, body)
      : this.api.createExpense(this.id(), body);

    request$.subscribe({
      next: () => {
        this.savingExpense.set(false);
        this.showExpense.set(false);
        this.reload();
      },
      error: (error) => {
        this.savingExpense.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Could not save',
          detail: error?.error?.message || 'Check the split amounts.',
        });
      },
    });
  }

  deleteExpense(): void {
    const editId = this.editingId();
    if (!editId) return;
    this.api.deleteExpense(editId).subscribe(() => {
      this.showExpense.set(false);
      this.reload();
    });
  }

  // ── Settle ──
  openSettle(fromId?: string, toId?: string, amountCents?: number): void {
    this.settleFrom = fromId || this.myId();
    this.settleTo = toId || '';
    this.settleAmount = amountCents ? amountCents / 100 : null;
    this.showSettle.set(true);
  }

  saveSettle(): void {
    if (
      !this.settleFrom ||
      !this.settleTo ||
      this.settleFrom === this.settleTo ||
      !this.settleAmount
    ) {
      this.messages.add({
        severity: 'warn',
        summary: 'Incomplete',
        detail: 'Pick two different members and an amount.',
      });
      return;
    }
    this.savingSettle.set(true);
    this.api
      .createSettlement(this.id(), {
        fromUserId: this.settleFrom,
        toUserId: this.settleTo,
        amount: this.settleAmount,
        currency: this.group()?.currency || 'CAD',
      })
      .subscribe({
        next: () => {
          this.savingSettle.set(false);
          this.showSettle.set(false);
          this.reload();
        },
        error: (error) => {
          this.savingSettle.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'Could not save payment',
            detail: error?.error?.message || 'Something went wrong.',
          });
        },
      });
  }

  // ── Members ──
  openMembers(): void {
    this.newMemberUsername = '';
    this.showMembers.set(true);
  }

  addMember(): void {
    const username = this.newMemberUsername.trim();
    if (!username) return;
    this.addingMember.set(true);
    this.api.addMember(this.id(), username).subscribe({
      next: (group) => {
        this.addingMember.set(false);
        this.newMemberUsername = '';
        this.group.set(group);
        this.reload();
      },
      error: (error) => {
        this.addingMember.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Could not add member',
          detail: error?.error?.message || `No user "${username}".`,
        });
      },
    });
  }

  deleteGroup(): void {
    this.api.deleteGroup(this.id()).subscribe(() => {
      this.showMembers.set(false);
      this.router.navigate(['/groups']);
    });
  }
}
