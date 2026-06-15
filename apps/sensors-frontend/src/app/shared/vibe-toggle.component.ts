import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VIBES, VibeService } from '../core/vibe.service';

/** Fixed vertical rail on the right that switches between the mockups. */
@Component({
  selector: 'app-vibe-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="rail" aria-label="Choose a look">
      <span class="cap">LOOK</span>
      @for (v of vibes; track v.key) {
        <button
          class="opt"
          [class.active]="v.key === vibe.vibe()"
          (click)="vibe.set(v.key)"
          [attr.aria-pressed]="v.key === vibe.vibe()"
          [title]="v.name + ' — ' + v.tagline"
        >
          <span class="sw" [style.background]="v.swatch"></span>
          <span class="lbl">
            <b>{{ v.name }}</b>
            <i>{{ v.tagline }}</i>
          </span>
        </button>
      }
    </nav>
  `,
  styles: [
    `
      .rail {
        position: fixed;
        top: 50%;
        right: clamp(8px, 1.5vw, 18px);
        transform: translateY(-50%);
        z-index: 50;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--surface) 80%, transparent);
        border: 1px solid var(--border);
        backdrop-filter: blur(12px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
      }
      .cap {
        text-align: center;
        font-size: 0.58rem;
        letter-spacing: 0.14em;
        color: var(--text-faint);
        margin-bottom: 2px;
      }
      .opt {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 8px;
        border-radius: 999px;
        color: var(--text-dim);
        transition: all 0.2s ease;
      }
      .sw {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        flex: none;
        box-shadow: 0 0 0 2px var(--surface);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .lbl {
        display: none;
        line-height: 1.05;
        text-align: left;
        white-space: nowrap;
        padding-right: 4px;
      }
      .lbl b {
        display: block;
        font-size: 0.82rem;
        color: var(--text);
      }
      .lbl i {
        font-style: normal;
        font-size: 0.66rem;
        color: var(--text-dim);
      }
      .opt.active {
        background: var(--surface-2);
      }
      .opt.active .sw {
        transform: scale(1.15);
        box-shadow: 0 0 0 2px var(--surface), 0 0 12px var(--accent);
      }
      .opt:hover .lbl b {
        color: var(--text);
      }
      /* Roomy screens: reveal labels and left-align the rail content. */
      @media (min-width: 620px) {
        .rail {
          border-radius: 18px;
        }
        .lbl {
          display: block;
        }
      }
    `,
  ],
})
export class VibeToggleComponent {
  readonly vibe = inject(VibeService);
  readonly vibes = VIBES;
}
