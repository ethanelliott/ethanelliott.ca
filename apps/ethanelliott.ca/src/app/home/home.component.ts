import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AboutComponent } from './about/about.component';
import { BackgroundComponent } from './background/background.component';
import { ContactComponent } from './contact/contact.component';
import { HeroComponent } from './hero/hero.component';
import { SkillsComponent } from './skills/skills.component';
import { WorkComponent } from './work/work.component';

@Component({
  selector: 'ee-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackgroundComponent,
    HeroComponent,
    AboutComponent,
    WorkComponent,
    SkillsComponent,
    ContactComponent,
  ],
  host: { '(window:scroll)': 'onScroll()' },
  template: `
    <ee-background />

    <header class="nav" [class.scrolled]="scrolled()">
      <a class="brand" href="#top" aria-label="Back to top">
        <span class="bk">[</span>
        <span class="rev">E</span>E<span class="bk">]</span>
      </a>
      <nav class="links">
        <a href="#about">About</a>
        <a href="#work">Work</a>
        <a href="#skills">Skills</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main>
      <ee-hero />
      <ee-about />
      <ee-work />
      <ee-skills />
      <ee-contact />
    </main>
  `,
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly scrolled = signal(false);

  onScroll(): void {
    this.scrolled.set(window.scrollY > 24);
  }
}
