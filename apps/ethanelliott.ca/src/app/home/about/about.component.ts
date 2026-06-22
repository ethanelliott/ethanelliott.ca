import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../reveal.directive';

@Component({
  selector: 'ee-about',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <section class="section about" id="about">
      <div eeReveal>
        <span class="section-label">About</span>
        <h2 class="section-title">
          A full-stack developer who likes shipping the whole thing.
        </h2>
      </div>
      <div class="prose" eeReveal>
        <p>
          I'm Ethan — a software developer based in Ontario, Canada. I work
          end-to-end: designing the interface, wiring up the API, and getting
          it running in production. I care about clean code, fast load times,
          and details that make software feel effortless to use.
        </p>
        <p>
          Outside of my day job I run a small fleet of self-hosted apps — a
          personal platform of tools I've designed, built, and deployed myself.
          It's where I get to experiment with new ideas and keep my skills
          sharp across the entire stack.
        </p>
        <ul class="facts">
          <li><strong>10+</strong><span>apps built &amp; self-hosted</span></li>
          <li><strong>Full-stack</strong><span>frontend to DevOps</span></li>
          <li><strong>TypeScript</strong><span>end to end</span></li>
        </ul>
      </div>
    </section>
  `,
  styleUrl: './about.component.scss',
})
export class AboutComponent {}
