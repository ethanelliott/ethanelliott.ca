import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoComponent } from './logo/logo.component';

@Component({
  selector: 'ee-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent],
  template: `<div landingWrapper>
    <ee-logo />
  </div>`,
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
