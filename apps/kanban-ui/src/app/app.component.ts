import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastModule } from 'primeng/toast';

@Component({
  imports: [RouterModule, ToastModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  template: `
    <p-toast position="top-right" />
    <router-outlet />
  `,
  styles: ``,
})
export class AppComponent {}
