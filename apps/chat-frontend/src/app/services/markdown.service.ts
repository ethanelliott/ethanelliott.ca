import { Injectable } from '@angular/core';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';

// Register commonly-used languages to keep the bundle small
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import shell from 'highlight.js/lib/languages/shell';
import scss from 'highlight.js/lib/languages/scss';
import diff from 'highlight.js/lib/languages/diff';
import ini from 'highlight.js/lib/languages/ini';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('sh', shell);
hljs.registerLanguage('zsh', shell);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('toml', ini);

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  private readonly CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  constructor() {
    marked.use(
      markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code: string, lang: string) {
          if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return hljs.highlightAuto(code).value;
        },
      })
    );
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
        e.preventDefault();
        e.stopPropagation();
        const wrapper = btn.closest('.code-block-wrapper');
        if (!wrapper) return;
        const code = wrapper.querySelector('pre code');
        const text = code ? code.textContent || '' : '';
        this.copyToClipboard(text).then((ok) => {
          if (ok) {
            btn.innerHTML = `${this.CHECK_ICON}<span>Copied</span>`;
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = `${this.COPY_ICON}<span>Copy</span>`;
              btn.classList.remove('copied');
            }, 2000);
          }
        });
      });
    }
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    // Try modern clipboard API first
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to fallback
      }
    }
    // Fallback: textarea + execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  render(markdown: string): string {
    if (!markdown) return '';
    try {
      const html = marked.parse(markdown, { async: false }) as string;
      return this.wrapCodeBlocks(html);
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
      return this.wrapCodeBlocks(html);
    } catch {
      return partial;
    }
  }

  private wrapCodeBlocks(html: string): string {
    const copyBtn = `<button class="code-copy-btn" type="button" title="Copy code">${this.COPY_ICON}<span>Copy</span></button>`;

    // Wrap <pre><code class="hljs language-xxx"> blocks with header (language label + copy button)
    let result = html.replace(
      /<pre><code\s+class="hljs language-(\w+)">/g,
      (_match, lang) =>
        `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${this.escapeHtml(
          lang
        )}</span>${copyBtn}</div><pre><code class="hljs language-${lang}">`
    );

    // Wrap remaining <pre><code> blocks that didn't have a language class
    result = result.replace(
      /<pre><code(?!\s+class="hljs)([^>]*)>/g,
      (_match, attrs) =>
        `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">code</span>${copyBtn}</div><pre><code${attrs}>`
    );

    // Close wrapper divs after </code></pre>
    result = result.replace(/<\/code><\/pre>/g, '</code></pre></div>');

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
