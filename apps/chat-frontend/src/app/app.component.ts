import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { PwaUpdateService } from './services/pwa-update.service';

@Component({
  imports: [RouterModule, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  template: `
    <p-toast position="top-right" />
    @if (pwaUpdate.updateAvailable()) {
    <div class="update-banner">
      <i class="pi pi-sparkles"></i>
      <span>A new version is available</span>
      <button class="update-btn" (click)="pwaUpdate.reload()">Refresh</button>
    </div>
    }
    <router-outlet />
  `,
  styles: `
    .update-banner {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: color-mix(in srgb, var(--p-surface-900) 92%, transparent);
      backdrop-filter: blur(10px);
      border: 1px solid color-mix(in srgb, var(--p-primary-500) 40%, transparent);
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      font-size: 0.82rem;
      color: var(--p-text-color);
      animation: chat-fade-up 0.3s ease both;

      i {
        color: var(--chat-accent);
        font-size: 0.9rem;
      }
    }

    .update-btn {
      border: none;
      border-radius: 8px;
      background: var(--chat-gradient);
      color: white;
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 600;
      padding: 6px 12px;
      cursor: pointer;
      transition: filter 0.15s ease;

      &:hover {
        filter: brightness(1.12);
      }
    }
  `,
})
export class AppComponent {
  readonly pwaUpdate = inject(PwaUpdateService);
}
