import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ee-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg" aria-hidden="true">
      <div class="aurora">
        <span class="blob blob-1"></span>
        <span class="blob blob-2"></span>
        <span class="blob blob-3"></span>
      </div>
      <div class="grain"></div>
    </div>
  `,
  styleUrl: './background.component.scss',
})
export class BackgroundComponent {}
