import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Kanban board view with live columns.
 * Fully implemented in Phase 5.
 */
@Component({
  selector: 'app-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board-placeholder">
      <h2>Board</h2>
      <p>Coming in Phase 5</p>
    </div>
  `,
  styles: `
    .board-placeholder {
      padding: 2rem;
      color: var(--p-text-color);
    }
  `,
})
export class BoardComponent {}
