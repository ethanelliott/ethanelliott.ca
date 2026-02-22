import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DetectionSettingsComponent } from '../../components/detection-settings/detection-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [DetectionSettingsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-page">
      <h1 class="page-title">Settings</h1>
      <app-detection-settings />
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 600px;
      margin: 0 auto;
    }

    .page-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
    }
  `,
})
export class SettingsComponent {}
