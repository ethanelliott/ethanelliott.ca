import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Agent dashboard view.
 * Fully implemented in Phase 6.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dashboard-placeholder">
      <h2>Dashboard</h2>
      <p>Coming in Phase 6</p>
    </div>
  `,
  styles: `
    .dashboard-placeholder {
      padding: 2rem;
      color: var(--p-text-color);
    }
  `,
})
export class DashboardComponent {}
