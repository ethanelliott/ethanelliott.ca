import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ActivityItem } from '../../core/models';
import { MoneyPipe } from '../../core/money.pipe';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h2 class="section-title">Recent activity</h2>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (items().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-clock"></i>
          <p>No activity yet. Add an expense to get started.</p>
        </div>
      } @else {
        <div class="rows card">
          @for (item of items(); track item.expense.id) {
            <div class="activity-row">
              <div class="act-icon"><i class="pi pi-receipt"></i></div>
              <div class="act-main">
                <span class="act-desc">{{ item.expense.description }}</span>
                <span class="act-sub">
                  {{ item.groupName }} ·
                  {{ payerLabel(item) }}
                  {{ item.expense.amountCents | money: item.expense.currency }}
                </span>
              </div>
              <div class="act-meta">
                <span class="act-date">{{
                  item.expense.date | date: 'MMM d'
                }}</span>
                <span [class]="shareClass(item)">{{ shareText(item) }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .rows {
      overflow: hidden;
    }
    .activity-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      &:last-child {
        border-bottom: none;
      }
    }
    .act-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--brand-light);
      color: var(--brand);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .act-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      .act-desc {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .act-sub {
        font-size: 13px;
        color: var(--text-secondary);
      }
    }
    .act-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: 12px;
      .act-date {
        color: var(--text-muted);
      }
    }
  `,
})
export class ActivityComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly items = signal<ActivityItem[]>([]);
  readonly loading = signal(true);
  readonly myId = computed(() => this.auth.profile()?.id ?? '');

  constructor() {
    if (!this.auth.profile()) {
      void this.auth.loadProfile();
    }
    this.api.getActivity().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  payerLabel(item: ActivityItem): string {
    return item.expense.paidBy.id === this.myId()
      ? 'you paid'
      : `${item.expense.paidBy.name} paid`;
  }

  private myShareCents(item: ActivityItem): number {
    return (
      item.expense.splits.find((s) => s.user.id === this.myId())?.amountCents ??
      0
    );
  }

  shareText(item: ActivityItem): string {
    const e = item.expense;
    if (e.paidBy.id === this.myId()) {
      const lent = e.amountCents - this.myShareCents(item);
      return lent > 0 ? this.fmt(lent, e.currency, 'you lent') : '';
    }
    const owe = this.myShareCents(item);
    return owe > 0 ? this.fmt(owe, e.currency, 'you owe') : '';
  }

  shareClass(item: ActivityItem): string {
    return item.expense.paidBy.id === this.myId()
      ? 'amount-positive'
      : 'amount-negative';
  }

  private fmt(cents: number, currency: string, prefix: string): string {
    const value = (cents / 100).toLocaleString(undefined, {
      style: 'currency',
      currency,
    });
    return `${prefix} ${value}`;
  }
}
