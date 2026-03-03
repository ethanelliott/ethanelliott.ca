import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-page">
      <h1>Settings</h1>
      <p class="placeholder-text">
        Settings will be available in a future update.
      </p>
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;

      h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 16px;
        color: var(--p-text-color);
      }

      .placeholder-text {
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
      }
    }
  `,
})
export class SettingsPageComponent {}
