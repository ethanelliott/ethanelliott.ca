import { Injectable } from '@angular/core';
import { marked } from 'marked';

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  constructor() {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Global click handler for copy buttons (event delegation)
    if (typeof document !== 'undefined') {
      document.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest(
          '.code-copy-btn'
        ) as HTMLButtonElement | null;
        if (!btn) return;
        const pre = btn.closest('pre');
        if (!pre) return;
        const code = pre.querySelector('code');
        const text = code ? code.textContent || '' : pre.textContent || '';
        navigator.clipboard.writeText(text).then(
          () => {
            btn.innerHTML = '<i class="pi pi-check"></i>';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = '<i class="pi pi-copy"></i>';
              btn.classList.remove('copied');
            }, 2000);
          },
          () => {
            // Fallback — silently fail
          }
        );
      });
    }
  }

  render(markdown: string): string {
    if (!markdown) return '';
    try {
      const html = marked.parse(markdown, { async: false }) as string;
      return this.addCopyButtons(html);
    } catch {
      return markdown;
    }
  }

  renderStreaming(partial: string): string {
    if (!partial) return '';
    try {
      let text = partial;
      const codeBlockCount = (text.match(/```/g) || []).length;
      if (codeBlockCount % 2 !== 0) {
        text += '\n```';
      }
      const html = marked.parse(text, { async: false }) as string;
      return this.addCopyButtons(html);
    } catch {
      return partial;
    }
  }

  private addCopyButtons(html: string): string {
    // Inject a copy button into each <pre> block
    return html.replace(
      /<pre>/g,
      '<pre class="code-block-wrapper"><button class="code-copy-btn" type="button" title="Copy code"><i class="pi pi-copy"></i></button>'
    );
  }
}
