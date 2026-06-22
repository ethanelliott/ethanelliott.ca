import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RevealDirective } from '../reveal.directive';

interface SkillGroup {
  title: string;
  items: string[];
}

@Component({
  selector: 'ee-skills',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective],
  template: `
    <section class="section skills" id="skills">
      <div eeReveal>
        <span class="section-label">Toolkit</span>
        <h2 class="section-title">The stack I reach for.</h2>
      </div>

      <div class="groups">
        @for (group of groups; track group.title) {
          <div class="group" eeReveal>
            <h3>{{ group.title }}</h3>
            <ul>
              @for (item of group.items; track item) {
                <li>{{ item }}</li>
              }
            </ul>
          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './skills.component.scss',
})
export class SkillsComponent {
  readonly groups: SkillGroup[] = [
    {
      title: 'Frontend',
      items: ['Angular', 'TypeScript', 'RxJS', 'SCSS', 'Responsive UI/UX'],
    },
    {
      title: 'Backend',
      items: ['Node.js', 'NestJS', 'REST APIs', 'WebSockets', 'Databases'],
    },
    {
      title: 'Tooling & Infra',
      items: ['Nx Monorepo', 'Bun', 'Docker', 'Self-hosting', 'CI/CD', 'Git'],
    },
  ];
}
