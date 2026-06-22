import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { UpdateService } from '../../services/update.service';

/**
 * Settings card for the installed PWA: shows whether a new version is ready
 * and lets the user check for / apply updates on demand. The app itself is
 * online-only (live video + events), so this is purely about keeping the
 * installed shell current.
 */
@Component({
  selector: 'app-update-settings',
  standalone: true,
  imports: [ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-container glass-card">
      <div class="settings-header">
        <i class="pi pi-sync"></i>
        <span>App Updates</span>
        <span class="spacer"></span>
        <span class="status-badge" [class.active]="update.updateReady()">
          {{ update.updateReady() ? 'Update ready' : 'Up to date' }}
        </span>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">
            <i class="pi pi-download"></i>
            Software version
          </span>
          <span class="setting-hint">
            @if (update.updateReady()) {
              A new version is ready — apply it to reload into the latest build.
            } @else {
              The dashboard checks automatically; you can also check now.
            }
          </span>
        </div>
        @if (update.updateReady()) {
          <button pButton type="button" (click)="update.apply()">
            <i class="pi pi-sync"></i>
            Apply update
          </button>
        } @else {
          <button
            pButton
            type="button"
            [text]="true"
            [disabled]="update.checking()"
            (click)="checkUpdates()"
          >
            <i class="pi pi-sync" [class.spin]="update.checking()"></i>
            {{ update.checking() ? 'Checking…' : checkLabel() }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .settings-container {
      overflow: hidden;
    }

    .settings-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 500;

      i {
        color: var(--accent-blue);
        font-size: 20px;
      }
    }

    .spacer {
      flex: 1;
    }

    .status-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(96, 96, 120, 0.2);
      color: var(--text-secondary);

      &.active {
        background: rgba(34, 197, 94, 0.15);
        color: var(--accent-green);
      }
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .setting-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;

      i {
        color: var(--text-muted);
        font-size: 16px;
      }
    }

    .setting-hint {
      font-size: 12px;
      color: var(--text-secondary);
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .spin {
      animation: spin 0.9s linear infinite;
    }
  `,
})
export class UpdateSettingsComponent {
  readonly update = inject(UpdateService);
  readonly checkLabel = signal('Check for updates');

  async checkUpdates(): Promise<void> {
    const found = await this.update.check();
    if (!found) {
      this.checkLabel.set('Up to date');
      setTimeout(() => this.checkLabel.set('Check for updates'), 2500);
    }
  }
}
