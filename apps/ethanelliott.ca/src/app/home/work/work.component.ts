import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../reveal.directive';

interface Capability {
  name: string;
  blurb: string;
  tags: string[];
}

@Component({
  selector: 'ee-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <section class="section work" id="work">
      <div eeReveal>
        <span class="section-label">What I Do</span>
        <h2 class="section-title">From first pixel to production.</h2>
        <p class="lead">
          I work across the whole stack — designing the interface, building the
          services behind it, and shipping the result.
        </p>
      </div>

      <div class="grid">
        @for (item of capabilities; track item.name) {
          <article class="card" eeReveal>
            <h3>{{ item.name }}</h3>
            <p>{{ item.blurb }}</p>
            <ul class="tags">
              @for (tag of item.tags; track tag) {
                <li>{{ tag }}</li>
              }
            </ul>
          </article>
        }
      </div>
    </section>
  `,
  styleUrl: './work.component.scss',
})
export class WorkComponent {
  readonly capabilities: Capability[] = [
    {
      name: 'Web Applications',
      blurb:
        'Fast, responsive interfaces built with Angular and modern web standards — the kind that feel effortless to use.',
      tags: ['Angular', 'TypeScript', 'SCSS'],
    },
    {
      name: 'APIs & Backends',
      blurb:
        'Well-structured, reliable services that power the frontend and scale cleanly as ideas grow.',
      tags: ['Node.js', 'NestJS', 'REST'],
    },
    {
      name: 'UI / UX Design',
      blurb:
        'Clean, considered, accessible interfaces — details that make software feel polished and intentional.',
      tags: ['Design', 'Accessibility'],
    },
    {
      name: 'Real-Time Systems',
      blurb:
        'Live dashboards and streaming experiences driven by websockets and real-time data.',
      tags: ['WebSockets', 'Realtime'],
    },
    {
      name: 'DevOps & Hosting',
      blurb:
        'End-to-end deployment with Docker and CI/CD — comfortable owning the whole pipeline.',
      tags: ['Docker', 'CI/CD', 'Self-hosting'],
    },
    {
      name: 'Performance',
      blurb:
        'Lean bundles, quick loads, and the small optimizations that make an app feel instant.',
      tags: ['Optimization', 'Tooling'],
    },
  ];
}
