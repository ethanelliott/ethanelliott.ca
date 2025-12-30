import { Component } from '@angular/core';
import { WheelComponent } from './wheel/wheel.component';

@Component({
  selector: 'app-root',
  imports: [WheelComponent],
  template: `<app-wheel />`,
  styles: ``,
})
export class AppComponent {}
