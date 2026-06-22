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
          I'm always building — experimenting with new ideas and tools to keep
          my skills sharp across the entire stack, from polished frontends to
          the infrastructure that runs them.
        </p>
        <ul class="facts">
          <li><strong>Full-stack</strong><span>frontend to DevOps</span></li>
          <li><strong>End-to-end</strong><span>idea to deployment</span></li>
          <li><strong>TypeScript</strong><span>top to bottom</span></li>
        </ul>
      </div>
    </section>
  `,
  styleUrl: './about.component.scss',
})
export class AboutComponent {}
