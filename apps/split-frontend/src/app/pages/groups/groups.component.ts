import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { GroupSummary, Overview } from '../../core/models';
import { MoneyPipe } from '../../core/money.pipe';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, SelectButton, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <!-- Overview hero -->
      <section class="overview card">
        @if (overview(); as o) {
          <div class="overview-row">
            <div class="overview-item">
              <span class="label">you are owed</span>
              <span class="value amount-positive">{{
                o.youAreOwedCents | money: o.currency
              }}</span>
            </div>
            <div class="overview-item">
              <span class="label">you owe</span>
              <span class="value amount-negative">{{
                o.youOweCents | money: o.currency
              }}</span>
            </div>
            <div class="overview-item">
              <span class="label">total balance</span>
              <span
                class="value"
                [class.amount-positive]="o.netCents >= 0"
                [class.amount-negative]="o.netCents < 0"
                >{{ o.netCents | money: o.currency }}</span
              >
            </div>
          </div>
        } @else {
          <div class="overview-row skeleton">Loading…</div>
        }
      </section>

      <div class="list-header">
        <h2 class="section-title" style="margin:0">Your groups</h2>
        <p-button
          label="New"
          icon="pi pi-plus"
          size="small"
          (onClick)="openCreate()"
        />
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (groups().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-users"></i>
          <p>No groups yet.</p>
          <p-button
            label="Create your first group"
            (onClick)="openCreate()"
          />
        </div>
      } @else {
        <div class="group-list">
          @for (g of groups(); track g.id) {
            <button class="group-card card" (click)="open(g)">
              <div class="group-avatar" [attr.data-type]="g.type">
                <i [class]="'pi ' + typeIcon(g.type)"></i>
              </div>
              <div class="group-info">
                <span class="group-name">{{ g.name }}</span>
                <span class="group-meta"
                  >{{ g.memberCount }} member{{
                    g.memberCount === 1 ? '' : 's'
                  }}</span
                >
              </div>
              <div class="group-balance">
                @if (g.yourBalanceCents === 0) {
                  <span class="settled">settled up</span>
                } @else if (g.yourBalanceCents > 0) {
                  <span class="label">you are owed</span>
                  <span class="amount-positive">{{
                    g.yourBalanceCents | money: g.currency
                  }}</span>
                } @else {
                  <span class="label">you owe</span>
                  <span class="amount-negative">{{
                    -g.yourBalanceCents | money: g.currency
                  }}</span>
                }
              </div>
            </button>
          }
        </div>
      }
    </div>

    <!-- Create group dialog -->
    <p-dialog
      header="New group"
      [(visible)]="showCreate"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '92vw', maxWidth: '440px' }"
    >
      <div class="dialog-body">
        <div class="field">
          <label>Group name</label>
          <input pInputText [(ngModel)]="newName" placeholder="Apartment, Trip to Italy…" />
        </div>
        <div class="field">
          <label>Type</label>
          <p-selectButton
            [options]="typeOptions"
            [(ngModel)]="newType"
            optionLabel="label"
            optionValue="value"
          />
        </div>
        <div class="field">
          <label>Add members (usernames, comma separated)</label>
          <input
            pInputText
            [(ngModel)]="newMembers"
            placeholder="alex, sam"
            autocapitalize="none"
          />
          <small>You're added automatically. Others must already have an account.</small>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="showCreate.set(false)" />
        <p-button
          label="Create"
          [loading]="creating()"
          (onClick)="create()"
        />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .overview {
      padding: 16px;
      margin-bottom: 8px;
    }
    .overview-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .overview-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      text-align: center;
    }
    .overview-item .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .overview-item .value {
      font-size: 17px;
      font-weight: 700;
    }
    .skeleton {
      color: var(--text-muted);
      justify-content: center;
      padding: 8px;
    }

    .list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 18px 4px 10px;
    }

    .group-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .group-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      text-align: left;
      cursor: pointer;
      width: 100%;
      background: var(--bg-surface);
      transition: transform 0.06s ease, box-shadow 0.12s ease;
    }
    .group-card:active {
      transform: scale(0.99);
    }

    .group-avatar {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--brand-light);
      color: var(--brand);
      flex-shrink: 0;
      i {
        font-size: 20px;
      }
    }

    .group-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .group-name {
      font-weight: 600;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .group-meta {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .group-balance {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-weight: 600;
      font-size: 15px;
      text-align: right;
    }
    .group-balance .label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .group-balance .settled {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
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
      input {
        width: 100%;
      }
      small {
        color: var(--text-muted);
        font-size: 12px;
      }
    }
  `,
})
export class GroupsComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  readonly groups = signal<GroupSummary[]>([]);
  readonly overview = signal<Overview | null>(null);
  readonly loading = signal(true);

  readonly showCreate = signal(false);
  readonly creating = signal(false);
  newName = '';
  newType = 'other';
  newMembers = '';

  readonly typeOptions = [
    { label: 'Trip', value: 'trip' },
    { label: 'Home', value: 'home' },
    { label: 'Couple', value: 'couple' },
    { label: 'Other', value: 'other' },
  ];

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.getGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getOverview().subscribe((o) => this.overview.set(o));
  }

  typeIcon(type: string): string {
    switch (type) {
      case 'trip':
        return 'pi-send';
      case 'home':
        return 'pi-home';
      case 'couple':
        return 'pi-heart';
      default:
        return 'pi-users';
    }
  }

  open(g: GroupSummary): void {
    this.router.navigate(['/groups', g.id]);
  }

  openCreate(): void {
    this.newName = '';
    this.newType = 'other';
    this.newMembers = '';
    this.showCreate.set(true);
  }

  create(): void {
    const name = this.newName.trim();
    if (!name) {
      this.messages.add({
        severity: 'warn',
        summary: 'Name required',
        detail: 'Give your group a name.',
      });
      return;
    }
    const memberUsernames = this.newMembers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.creating.set(true);
    this.api
      .createGroup({ name, type: this.newType, memberUsernames })
      .subscribe({
        next: (group) => {
          this.creating.set(false);
          this.showCreate.set(false);
          this.router.navigate(['/groups', group.id]);
        },
        error: (error) => {
          this.creating.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'Could not create group',
            detail: error?.error?.message || 'Something went wrong.',
          });
        },
      });
  }
}
