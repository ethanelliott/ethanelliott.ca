import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoComponent } from '../logo/logo.component';

@Component({
  selector: 'ee-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent],
  template: `
    <section class="hero" id="top">
      <ee-logo />
      <h1 class="name">Ethan Elliott</h1>
      <p class="role">Software Developer</p>
      <p class="tagline">
        I build slick, efficient, and genuinely useful web experiences —
        from pixel to production.
      </p>
      <a class="cue" href="#about" aria-label="Scroll to about">
        <span class="cue-text">Scroll</span>
        <span class="cue-arrow"></span>
      </a>
    </section>
  `,
  styleUrl: './hero.component.scss',
})
export class HeroComponent {}
