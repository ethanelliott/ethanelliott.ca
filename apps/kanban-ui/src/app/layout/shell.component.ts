import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * App shell — wraps all pages with the sidebar layout.
 * Fully implemented in Phase 4.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
  styles: ``,
})
export class ShellComponent {}
