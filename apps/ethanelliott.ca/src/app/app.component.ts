import { Component } from '@angular/core';
import { MatSlideToggle } from '@angular/material/slide-toggle';

@Component({
  standalone: true,
  imports: [MatSlideToggle],
  selector: 'ee-root',
  template: `<p>Hello</p>
    <mat-slide-toggle>Toggle me!</mat-slide-toggle> `,
  styles: ``,
})
export class AppComponent {}
