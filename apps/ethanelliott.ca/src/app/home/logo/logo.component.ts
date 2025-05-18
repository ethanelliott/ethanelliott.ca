import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ee-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  styleUrl: './logo.component.scss',
  template: `<div class="logo-wrapper">
    <span class="bracket left">[</span>
    <span class="e backwards">E</span>
    <span class="e">E</span>
    <span class="bracket right">]</span>
  </div>`,
})
export class LogoComponent {}
