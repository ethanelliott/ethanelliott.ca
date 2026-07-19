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
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { WheelSummary } from '../../core/models';

@Component({
  selector: 'app-wheels',
  standalone: true,
  imports: [FormsModule, Button, Dialog, InputText, ConfirmDialog],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Your wheels</h1>
        <p-button
          label="New wheel"
          icon="pi pi-plus"
          (onClick)="openCreate()"
        />
      </div>

      @if (loading()) {
        <div class="empty-state"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (wheels().length === 0) {
        <div class="empty-state card">
          <i class="pi pi-bullseye"></i>
          <p>No wheels yet.</p>
          <p class="muted">Create one to start spinning for a decision.</p>
        </div>
      } @else {
        <div class="grid">
          @for (wheel of wheels(); track wheel.id) {
            <div class="wheel-card card" (click)="open(wheel.id)">
              <div class="wheel-card-body">
                <h3>{{ wheel.name }}</h3>
                <div class="meta">
                  <span><i class="pi pi-list"></i> {{ wheel.itemCount }} items</span>
                  @if (wheel.tagCount > 0) {
                    <span><i class="pi pi-tags"></i> {{ wheel.tagCount }} tags</span>
                  }
                  @if (wheel.role === 'editor') {
                    <span class="shared-badge">
                      <i class="pi pi-users"></i>
                      &#64;{{ wheel.owner.username || wheel.owner.name }}
                    </span>
                  } @else if (wheel.sharedCount > 0) {
                    <span class="shared-badge">
                      <i class="pi pi-users"></i> {{ wheel.sharedCount }}
                    </span>
                  }
                </div>
              </div>
              @if (wheel.role === 'owner') {
                <button
                  class="delete-btn"
                  (click)="confirmDelete($event, wheel)"
                  aria-label="Delete wheel"
                >
                  <i class="pi pi-trash"></i>
                </button>
              } @else {
                <button
                  class="delete-btn"
                  (click)="confirmLeave($event, wheel)"
                  aria-label="Leave shared wheel"
                >
                  <i class="pi pi-sign-out"></i>
                </button>
              }
            </div>
          }
        </div>
      }
    </div>

    <p-dialog
      [(visible)]="createOpen"
      [modal]="true"
      header="New wheel"
      [style]="{ width: '24rem' }"
    >
      <div class="field">
        <label for="name">Name</label>
        <input
          pInputText
          id="name"
          [(ngModel)]="newName"
          placeholder="e.g. Where to eat?"
          (keyup.enter)="create()"
        />
      </div>
      <ng-template #footer>
        <p-button
          label="Cancel"
          [text]="true"
          (onClick)="createOpen.set(false)"
        />
        <p-button
          label="Create"
          icon="pi pi-check"
          [loading]="creating()"
          (onClick)="create()"
        />
      </ng-template>
    </p-dialog>

    <p-confirmDialog />
  `,
  styles: `
    .page-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      h1 {
        font-size: 22px;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    @media (min-width: 640px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .wheel-card {
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: box-shadow 0.15s, transform 0.15s;
      &:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
    }
    .wheel-card-body {
      flex: 1;
      min-width: 0;
      h3 {
        font-size: 16px;
        margin-bottom: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
    .shared-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--brand);
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--text-secondary);
      font-size: 13px;
      i {
        margin-right: 4px;
      }
    }
    .delete-btn {
      border: none;
      background: transparent;
      color: var(--text-muted);
      width: 36px;
      height: 36px;
      border-radius: 8px;
      cursor: pointer;
      flex-shrink: 0;
      &:hover {
        background: var(--bg-subtle);
        color: #e8643c;
      }
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
    }
  `,
})
export class WheelsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly wheels = signal<WheelSummary[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly createOpen = signal(false);
  newName = '';

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.listWheels().subscribe({
      next: (wheels) => {
        this.wheels.set(wheels);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.newName = '';
    this.createOpen.set(true);
  }

  create(): void {
    const name = this.newName.trim();
    if (!name) return;
    this.creating.set(true);
    this.api.createWheel({ name, tags: [], items: [] }).subscribe({
      next: (wheel) => {
        this.creating.set(false);
        this.createOpen.set(false);
        this.router.navigate(['/wheels', wheel.id]);
      },
      error: () => {
        this.creating.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'Could not create wheel',
        });
      },
    });
  }

  open(id: string): void {
    this.router.navigate(['/wheels', id]);
  }

  confirmDelete(event: Event, wheel: WheelSummary): void {
    event.stopPropagation();
    this.confirm.confirm({
      header: 'Delete wheel',
      message: `Delete "${wheel.name}"? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.api.deleteWheel(wheel.id).subscribe({
          next: () =>
            this.wheels.update((list) =>
              list.filter((w) => w.id !== wheel.id)
            ),
          error: () =>
            this.messages.add({
              severity: 'error',
              summary: 'Could not delete wheel',
            }),
        });
      },
    });
  }

  confirmLeave(event: Event, wheel: WheelSummary): void {
    event.stopPropagation();
    this.confirm.confirm({
      header: 'Leave wheel',
      message: `Stop collaborating on "${wheel.name}"? The owner keeps the wheel.`,
      icon: 'pi pi-sign-out',
      accept: async () => {
        const myId =
          this.auth.profile()?.id ?? (await this.auth.loadProfile())?.id;
        if (!myId) {
          this.messages.add({
            severity: 'error',
            summary: 'Could not leave wheel',
            detail: 'Please try again.',
          });
          return;
        }
        this.api.unshareWheel(wheel.id, myId).subscribe({
          next: () =>
            this.wheels.update((list) =>
              list.filter((w) => w.id !== wheel.id)
            ),
          error: () =>
            this.messages.add({
              severity: 'error',
              summary: 'Could not leave wheel',
            }),
        });
      },
    });
  }
}
