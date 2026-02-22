import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DetectionSettingsComponent } from '../../components/detection-settings/detection-settings.component';
import { NotificationSettingsComponent } from '../../components/notification-settings/notification-settings.component';
import { AnalysisSettingsComponent } from '../../components/analysis-settings/analysis-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    DetectionSettingsComponent,
    NotificationSettingsComponent,
    AnalysisSettingsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-page">
      <h1 class="page-title">Settings</h1>
      <app-analysis-settings />
      <app-notification-settings />
      <app-detection-settings />
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 600px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .page-title {
      font-size: 24px;
      font-weight: 600;
    }
  `,
})
export class SettingsComponent {}
