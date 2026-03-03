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
        const wrapper = btn.closest('.code-block-wrapper');
        if (!wrapper) return;
        const code = wrapper.querySelector('pre code');
        const text = code ? code.textContent || '' : '';
        navigator.clipboard.writeText(text).then(
          () => {
            btn.innerHTML = '<i class="pi pi-check"></i> Copied';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = '<i class="pi pi-copy"></i> Copy';
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
    // Wrap <pre><code class="hljs language-xxx"> blocks with header (language label + copy button)
    let result = html.replace(
      /<pre><code\s+class="hljs language-(\w+)">/g,
      (_match, lang) =>
        `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${this.escapeHtml(
          lang
        )}</span><button class="code-copy-btn" type="button" title="Copy code"><i class="pi pi-copy"></i> Copy</button></div><pre><code class="hljs language-${lang}">`
    );

    // Wrap remaining <pre><code> blocks that didn't have a language class
    result = result.replace(
      /<pre><code(?!\s+class="hljs)([^>]*)>/g,
      (_match, attrs) =>
        `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">code</span><button class="code-copy-btn" type="button" title="Copy code"><i class="pi pi-copy"></i> Copy</button></div><pre><code${attrs}>`
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
