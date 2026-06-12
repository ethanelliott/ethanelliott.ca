import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { Dialog } from 'primeng/dialog';
import { LayoutService } from '../core/layout.service';

/**
 * Renders content as a centered dialog on desktop and as a full-screen
 * page (slide-up, back-arrow header, pinned footer) on mobile.
 *
 * Usage:
 *   <app-modal header="Add expense" [(visible)]="showExpense">
 *     …body…
 *     <p-button modal-footer label="Save" />
 *   </app-modal>
 *
 * The shell styles live in styles.scss under `.responsive-modal`.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [draggable]="false"
      [showHeader]="false"
      [dismissableMask]="true"
      [blockScroll]="true"
      [focusOnShow]="false"
      [position]="position()"
      [styleClass]="styleClass()"
    >
      <div class="modal-shell">
        <header class="modal-header">
          <button
            type="button"
            class="modal-nav-btn modal-back"
            aria-label="Back"
            (click)="visible.set(false)"
          >
            <i class="pi pi-arrow-left"></i>
          </button>
          <h2>{{ header() }}</h2>
          <button
            type="button"
            class="modal-nav-btn modal-close"
            aria-label="Close"
            (click)="visible.set(false)"
          >
            <i class="pi pi-times"></i>
          </button>
        </header>
        <div class="modal-body">
          <ng-content />
        </div>
        <footer class="modal-footer">
          <ng-content select="[modal-footer]" />
        </footer>
      </div>
    </p-dialog>
  `,
})
export class ResponsiveModalComponent {
  private readonly layout = inject(LayoutService);

  readonly header = input('');
  /** Wider variant for dense forms like the expense editor. */
  readonly wide = input(false);
  readonly visible = model(false);

  // Slide up from the bottom on mobile, fade in centered on desktop.
  readonly position = computed(() =>
    this.layout.isDesktop() ? ('center' as const) : ('bottom' as const)
  );

  readonly styleClass = computed(
    () => 'responsive-modal' + (this.wide() ? ' responsive-modal-wide' : '')
  );
}
