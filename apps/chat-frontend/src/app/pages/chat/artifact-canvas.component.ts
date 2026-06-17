import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { Artifact } from '../../models/types';

/**
 * Renders an LLM-authored HTML artifact live inside a sandboxed iframe.
 *
 * The iframe uses `srcdoc` with a restrictive sandbox: scripts are allowed (so
 * artifacts can be fully interactive) but the frame runs in an opaque origin
 * with no access to the parent page, its cookies, or storage.
 */
@Component({
  selector: 'app-artifact-canvas',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas">
      <div class="canvas-toolbar">
        <div class="toolbar-left">
          <i class="pi pi-palette canvas-icon"></i>
          <div class="title-block">
            <span class="canvas-title" [title]="active()?.title">{{
              active()?.title || 'Artifact'
            }}</span>
            @if (active(); as a) { @if (a.version > 1) {
            <span class="canvas-version">v{{ a.version }}</span>
            } }
          </div>
        </div>

        <div class="toolbar-right">
          @if (artifacts().length > 1) {
          <select
            class="artifact-select"
            [value]="active()?.id"
            (change)="onSelect($event)"
          >
            @for (a of artifacts(); track a.id) {
            <option [value]="a.id">{{ a.title }}</option>
            }
          </select>
          }
          <p-button
            [icon]="showSource() ? 'pi pi-eye' : 'pi pi-code'"
            [text]="true"
            severity="secondary"
            size="small"
            [pTooltip]="showSource() ? 'Preview' : 'View source'"
            (click)="showSource.set(!showSource())"
          />
          <p-button
            icon="pi pi-refresh"
            [text]="true"
            severity="secondary"
            size="small"
            pTooltip="Reload"
            (click)="reload()"
          />
          <p-button
            icon="pi pi-copy"
            [text]="true"
            severity="secondary"
            size="small"
            pTooltip="Copy HTML"
            (click)="copy()"
          />
          <p-button
            icon="pi pi-download"
            [text]="true"
            severity="secondary"
            size="small"
            pTooltip="Download .html"
            (click)="download()"
          />
          <p-button
            icon="pi pi-external-link"
            [text]="true"
            severity="secondary"
            size="small"
            pTooltip="Open in new tab"
            (click)="openInNewTab()"
          />
          <p-button
            icon="pi pi-times"
            [text]="true"
            severity="secondary"
            size="small"
            pTooltip="Close canvas"
            (click)="closePanel.emit()"
          />
        </div>
      </div>

      <div class="canvas-body">
        @if (!active()) {
        <div class="canvas-empty">
          <i class="pi pi-palette"></i>
          <span>No artifact yet</span>
        </div>
        } @else if (showSource()) {
        <pre class="canvas-source">{{ active()!.html }}</pre>
        } @else { @if (showFrame()) {
        <iframe
          class="canvas-frame"
          [srcdoc]="srcdoc()"
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads"
          referrerpolicy="no-referrer"
          title="Artifact preview"
        ></iframe>
        } }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .canvas {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--p-surface-950);
      overflow: hidden;
    }

    .canvas-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--p-surface-800);
      background: var(--p-surface-900);
      flex-shrink: 0;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .canvas-icon {
      color: var(--p-primary-color);
      font-size: 1rem;
      flex-shrink: 0;
    }

    .title-block {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
    }

    .canvas-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--p-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .canvas-version {
      font-size: 0.7rem;
      color: var(--p-text-muted-color);
      flex-shrink: 0;
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .artifact-select {
      max-width: 140px;
      background: var(--p-surface-800);
      color: var(--p-text-color);
      border: 1px solid var(--p-surface-700);
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 0.78rem;
      margin-right: 4px;
    }

    .canvas-body {
      flex: 1;
      overflow: hidden;
      position: relative;
      background: #ffffff;
    }

    .canvas-frame {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: #ffffff;
    }

    .canvas-source {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 12px;
      overflow: auto;
      background: var(--p-surface-950);
      color: var(--p-text-color);
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.75rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .canvas-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--p-text-muted-color);
      background: var(--p-surface-950);

      i {
        font-size: 2rem;
        opacity: 0.5;
      }
    }
  `,
})
export class ArtifactCanvasComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly messageService = inject(MessageService);

  readonly artifacts = input.required<Artifact[]>();
  readonly activeId = input<string | null>(null);

  readonly closePanel = output<void>();
  readonly activeIdChange = output<string>();

  readonly showSource = signal(false);
  readonly showFrame = signal(true);

  readonly active = computed<Artifact | null>(() => {
    const list = this.artifacts();
    if (list.length === 0) return null;
    const id = this.activeId();
    if (id) {
      const found = list.find((a) => a.id === id);
      if (found) return found;
    }
    return list[list.length - 1];
  });

  readonly srcdoc = computed<SafeHtml>(() => {
    const html = this.active()?.html ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  onSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.activeIdChange.emit(value);
  }

  reload(): void {
    // Recreate the iframe element to force a full reload of the document.
    this.showFrame.set(false);
    setTimeout(() => this.showFrame.set(true));
  }

  async copy(): Promise<void> {
    const html = this.active()?.html;
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Artifact HTML copied to clipboard.',
        life: 2000,
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Copy failed',
        detail: 'Could not access the clipboard.',
        life: 3000,
      });
    }
  }

  download(): void {
    const artifact = this.active();
    if (!artifact) return;
    const blob = new Blob([artifact.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.slugify(artifact.title)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  openInNewTab(): void {
    const artifact = this.active();
    if (!artifact) return;
    const blob = new Blob([artifact.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke a bit later so the new tab has time to load the document.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  private slugify(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'artifact'
    );
  }
}
