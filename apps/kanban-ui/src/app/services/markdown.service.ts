import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly sanitizer = inject(DomSanitizer);

  /** Parse markdown → sanitized SafeHtml for [innerHTML] binding. */
  render(src: string | null | undefined): SafeHtml {
    if (!src?.trim()) return '';
    const html = marked.parse(src) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
