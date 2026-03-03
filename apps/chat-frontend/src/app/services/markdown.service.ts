import { Injectable } from '@angular/core';
import { marked } from 'marked';

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  constructor() {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  render(markdown: string): string {
    if (!markdown) return '';
    try {
      return marked.parse(markdown, { async: false }) as string;
    } catch {
      return markdown;
    }
  }

  renderStreaming(partial: string): string {
    if (!partial) return '';
    try {
      // Add a zero-width space at the end to help the parser close tags
      // when the markdown is still being streamed
      let text = partial;
      // Count unclosed backtick blocks
      const codeBlockCount = (text.match(/```/g) || []).length;
      if (codeBlockCount % 2 !== 0) {
        text += '\n```';
      }
      return marked.parse(text, { async: false }) as string;
    } catch {
      return partial;
    }
  }
}
