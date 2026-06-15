import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VibeService } from './core/vibe.service';
import { AeroComponent } from './mockups/aero.component';
import { ConsoleComponent } from './mockups/console.component';
import { HearthComponent } from './mockups/hearth.component';
import { NebulaComponent } from './mockups/nebula.component';
import { VibeToggleComponent } from './shared/vibe-toggle.component';
import { SensorDetailComponent } from './shared/sensor-detail.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'vibe-' + vibe.vibe()" },
  imports: [
    AeroComponent,
    ConsoleComponent,
    HearthComponent,
    NebulaComponent,
    VibeToggleComponent,
    SensorDetailComponent,
  ],
  template: `
    @switch (vibe.vibe()) {
      @case ('aero') {
        <app-aero />
      }
      @case ('console') {
        <app-console />
      }
      @case ('hearth') {
        <app-hearth />
      }
      @case ('nebula') {
        <app-nebula />
      }
    }

    <app-vibe-toggle />
    <app-sensor-detail />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
    `,
  ],
})
export class AppComponent {
  readonly vibe = inject(VibeService);
}
