import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../reveal.directive';

interface Project {
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
        <span class="section-label">Selected Work</span>
        <h2 class="section-title">Things I've built and run myself.</h2>
        <p class="lead">
          A slice of my personal platform — apps I designed, developed, and
          deployed across the full stack.
        </p>
      </div>

      <div class="grid">
        @for (project of projects; track project.name) {
          <article class="card" eeReveal>
            <h3>{{ project.name }}</h3>
            <p>{{ project.blurb }}</p>
            <ul class="tags">
              @for (tag of project.tags; track tag) {
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
  readonly projects: Project[] = [
    {
      name: 'Finances',
      blurb:
        'A personal finance tracker for accounts, budgets, and spending insights — so the money story is always clear.',
      tags: ['Angular', 'NestJS', 'Charts'],
    },
    {
      name: 'Recipe Book',
      blurb:
        'A clean home for recipes: save, scale, and cook from a collection that is actually yours.',
      tags: ['Angular', 'API', 'UX'],
    },
    {
      name: 'Split',
      blurb:
        'Group expense splitting that figures out who owes who and settles up the easy way.',
      tags: ['Angular', 'NestJS'],
    },
    {
      name: 'AI Chat',
      blurb:
        'A self-hosted chat interface wired into my own AI gateway for fast, private conversations.',
      tags: ['Angular', 'LLMs', 'Streaming'],
    },
    {
      name: 'Camera Dashboard',
      blurb:
        'A live dashboard for monitoring home camera feeds at a glance, from anywhere.',
      tags: ['Angular', 'Realtime', 'Video'],
    },
    {
      name: 'Sensors',
      blurb:
        'Real-time environmental monitoring — CO₂, temperature, and humidity streamed from Aranet devices.',
      tags: ['IoT', 'Realtime', 'Node.js'],
    },
  ];
}
