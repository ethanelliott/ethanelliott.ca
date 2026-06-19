import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-trips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1 class="title">Trips</h1>

      <div class="empty-state card">
        <i class="pi pi-map"></i>
        <p class="headline">No trips yet</p>
        <p class="muted">
          Trip creation, the schedule calendar and the budget land in the next
          step. You're signed in and the app shell is ready.
        </p>
      </div>
    </div>
  `,
  styles: `
    .title {
      font-size: 22px;
      margin-bottom: 16px;
    }
    .empty-state .headline {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .empty-state {
      padding: 48px 24px;
    }
  `,
})
export class TripsComponent {}
