import { createTool, getToolRegistry } from '../tool-registry';

/** Simple LCS-based diff utility (no external deps) */
interface DiffChange {
  added?: boolean;
  removed?: boolean;
  value: string;
  count?: number;
}

function computeDiff(
  aTokens: string[],
  bTokens: string[],
  sep: string
): DiffChange[] {
  const m = aTokens.length,
    n = bTokens.length;
  // DP LCS table (space-optimised)
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        aTokens[i] === bTokens[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  const result: DiffChange[] = [];
  let i = 0,
    j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aTokens[i] === bTokens[j]) {
      const last = result[result.length - 1];
      if (last && !last.added && !last.removed) {
        last.value += sep + aTokens[i];
        last.count = (last.count ?? 1) + 1;
      } else result.push({ value: aTokens[i], count: 1 });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      const last = result[result.length - 1];
      if (last?.added) {
        last.value += sep + bTokens[j];
        last.count = (last.count ?? 1) + 1;
      } else result.push({ value: bTokens[j], added: true, count: 1 });
      j++;
    } else {
      const last = result[result.length - 1];
      if (last?.removed) {
        last.value += sep + aTokens[i];
        last.count = (last.count ?? 1) + 1;
      } else result.push({ value: aTokens[i], removed: true, count: 1 });
      i++;
    }
  }
  return result;
}

function diffLines(a: string, b: string): DiffChange[] {
  return computeDiff(a.split('\n'), b.split('\n'), '\n');
}

function diffWords(a: string, b: string): DiffChange[] {
  return computeDiff(a.split(/(\s+)/), b.split(/(\s+)/), '');
}

/** ─── format_json ────────────────────────────────────────────────── */

const formatJson = createTool(
  {
    name: 'format_json',
    description: 'Pretty-print or minify a JSON string. Optionally sort keys.',
    category: 'formatter',
    tags: ['json', 'format', 'pretty-print'],
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'JSON string to format' },
        mode: {
          type: 'string',
          enum: ['pretty', 'minify'],
          description:
            '"pretty" to indent, "minify" to compact. Default: pretty',
        },
        indent: {
          type: 'number',
          description: 'Spaces to indent (pretty only). Default: 2',
        },
        sort_keys: {
          type: 'boolean',
          description: 'Sort object keys alphabetically. Default: false',
        },
      },
      required: ['input'],
    },
  },
  async (params) => {
    const mode = (params.mode as string) ?? 'pretty';
    const indent = (params.indent as number) ?? 2;
    const sortKeys = (params.sort_keys as boolean) ?? false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(params.input as string);
    } catch (e) {
      return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
    }

    const sortFn = sortKeys
      ? (_: string, v: unknown) =>
          v !== null && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(
                Object.entries(v as Record<string, unknown>).sort()
              )
            : v
      : undefined;

    const result =
      mode === 'minify'
        ? JSON.stringify(parsed, sortFn)
        : JSON.stringify(parsed, sortFn, indent);

    return {
      success: true,
      data: {
        result,
        original_bytes: (params.input as string).length,
        result_bytes: result.length,
        savings_pct:
          mode === 'minify'
            ? `${(
                (((params.input as string).length - result.length) /
                  (params.input as string).length) *
                100
              ).toFixed(1)}%`
            : undefined,
      },
    };
  }
);

/** ─── validate_json ──────────────────────────────────────────────── */

const validateJson = createTool(
  {
    name: 'validate_json',
    description: 'Validate a JSON string and report errors with position info.',
    category: 'formatter',
    tags: ['json', 'validate'],
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'JSON string to validate' },
      },
      required: ['input'],
    },
  },
  async (params) => {
    const input = params.input as string;
    try {
      const parsed = JSON.parse(input);
      const type = Array.isArray(parsed) ? 'array' : typeof parsed;
      const keyCount =
        type === 'object' && parsed
          ? Object.keys(parsed as object).length
          : undefined;
      const itemCount = Array.isArray(parsed)
        ? (parsed as unknown[]).length
        : undefined;
      return {
        success: true,
        data: {
          valid: true,
          type,
          key_count: keyCount,
          item_count: itemCount,
          bytes: input.length,
        },
      };
    } catch (e) {
      const msg = (e as Error).message;
      const posMatch = msg.match(/position (\d+)/);
      const pos = posMatch ? parseInt(posMatch[1]) : null;
      const snippet =
        pos != null ? input.slice(Math.max(0, pos - 20), pos + 20) : undefined;
      return {
        success: true,
        data: {
          valid: false,
          error: msg,
          position: pos,
          snippet: snippet ? `...${snippet}...` : undefined,
          line:
            pos != null ? input.slice(0, pos).split('\n').length : undefined,
        },
      };
    }
  }
);

/** ─── diff_text ──────────────────────────────────────────────────── */

const diffText = createTool(
  {
    name: 'diff_text',
    description:
      'Show the diff between two text strings (line- or word-level).',
    category: 'formatter',
    tags: ['diff', 'text', 'compare'],
    parameters: {
      type: 'object',
      properties: {
        original: { type: 'string', description: 'Original text' },
        modified: { type: 'string', description: 'Modified text' },
        mode: {
          type: 'string',
          enum: ['lines', 'words'],
          description: 'Diff granularity. Default: lines',
        },
      },
      required: ['original', 'modified'],
    },
  },
  async (params) => {
    const mode = (params.mode as string) ?? 'lines';
    const orig = params.original as string;
    const mod = params.modified as string;
    const changes =
      mode === 'words' ? diffWords(orig, mod) : diffLines(orig, mod);

    const added = changes
      .filter((c) => c.added)
      .reduce((n, c) => n + (c.count ?? 1), 0);
    const removed = changes
      .filter((c) => c.removed)
      .reduce((n, c) => n + (c.count ?? 1), 0);

    const diffOutput = changes
      .map((c) => {
        const prefix = c.added ? '+' : c.removed ? '-' : ' ';
        return c.value
          .split('\n')
          .filter((l, i, arr) => i < arr.length - 1 || l !== '')
          .map((l) => `${prefix} ${l}`)
          .join('\n');
      })
      .join('\n');

    return {
      success: true,
      data: {
        additions: added,
        deletions: removed,
        unchanged: changes
          .filter((c) => !c.added && !c.removed)
          .reduce((n, c) => n + (c.count ?? 1), 0),
        diff: diffOutput,
        identical: added === 0 && removed === 0,
      },
    };
  }
);

/** ─── encode_decode ──────────────────────────────────────────────── */

const encodeDecode = createTool(
  {
    name: 'encode_decode',
    description:
      'Encode or decode text with base64, URL encoding, HTML entities, hex, or binary.',
    category: 'formatter',
    tags: ['encode', 'decode', 'base64', 'url', 'hex'],
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input text' },
        format: {
          type: 'string',
          enum: ['base64', 'url', 'html', 'hex', 'binary', 'ascii85'],
          description: 'Encoding format',
        },
        mode: {
          type: 'string',
          enum: ['encode', 'decode'],
          description: 'Encode or decode. Default: encode',
        },
      },
      required: ['input', 'format'],
    },
  },
  async (params) => {
    const input = params.input as string;
    const format = params.format as string;
    const mode = (params.mode as string) ?? 'encode';

    try {
      let result: string;
      switch (format) {
        case 'base64':
          result =
            mode === 'encode'
              ? Buffer.from(input, 'utf8').toString('base64')
              : Buffer.from(input, 'base64').toString('utf8');
          break;
        case 'url':
          result =
            mode === 'encode'
              ? encodeURIComponent(input)
              : decodeURIComponent(input);
          break;
        case 'html':
          if (mode === 'encode') {
            result = input
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          } else {
            result = input
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
          }
          break;
        case 'hex':
          result =
            mode === 'encode'
              ? Buffer.from(input, 'utf8').toString('hex')
              : Buffer.from(input, 'hex').toString('utf8');
          break;
        case 'binary':
          if (mode === 'encode') {
            result = input
              .split('')
              .map((c) => c.charCodeAt(0).toString(2).padStart(8, '0'))
              .join(' ');
          } else {
            result = input
              .split(' ')
              .map((b) => String.fromCharCode(parseInt(b, 2)))
              .join('');
          }
          break;
        default:
          return { success: false, error: `Unsupported format: ${format}` };
      }
      return { success: true, data: { input, format, mode, result } };
    } catch (e) {
      return {
        success: false,
        error: `${mode} failed: ${(e as Error).message}`,
      };
    }
  }
);

/** ─── get_color_info ─────────────────────────────────────────────── */

const getColorInfo = createTool(
  {
    name: 'get_color_info',
    description:
      'Convert and inspect a color across RGB, HEX, HSL, and HSV formats.',
    category: 'formatter',
    tags: ['color', 'format', 'converter'],
    parameters: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description:
            'Color in any format: "#ff5733", "rgb(255,87,51)", "hsl(14,100%,60%)", or CSS name like "red"',
        },
      },
      required: ['color'],
    },
  },
  async (params) => {
    const input = (params.color as string).trim().toLowerCase();

    // Parse hex
    let r: number, g: number, b: number;
    const cssColors: Record<string, string> = {
      red: 'ff0000',
      green: '008000',
      blue: '0000ff',
      white: 'ffffff',
      black: '000000',
      yellow: 'ffff00',
      cyan: '00ffff',
      magenta: 'ff00ff',
      orange: 'ffa500',
      purple: '800080',
      pink: 'ffc0cb',
      gray: '808080',
      grey: '808080',
      silver: 'c0c0c0',
      gold: 'ffd700',
      brown: 'a52a2a',
      lime: '00ff00',
      navy: '000080',
      teal: '008080',
      indigo: '4b0082',
    };

    try {
      if (input.startsWith('#')) {
        const hex = input.slice(1);
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (input.startsWith('rgb')) {
        const m = input.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        if (!m) throw new Error('Invalid rgb()');
        [, r, g, b] = m.map(Number) as [string, number, number, number];
      } else if (input.startsWith('hsl')) {
        const m = input.match(/(\d+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/);
        if (!m) throw new Error('Invalid hsl()');
        const h = parseFloat(m[1]) / 360;
        const s = parseFloat(m[2]) / 100;
        const l = parseFloat(m[3]) / 100;
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
        g = Math.round(hue2rgb(p, q, h) * 255);
        b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      } else if (cssColors[input]) {
        const hex = cssColors[input];
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return { success: false, error: `Cannot parse color: ${input}` };
      }

      const hex = `#${r.toString(16).padStart(2, '0')}${g
        .toString(16)
        .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      const max = Math.max(r, g, b) / 255,
        min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      const h60 =
        d === 0
          ? 0
          : max === r / 255
          ? (((g / 255 - b / 255) / d + 6) % 6) * 60
          : max === g / 255
          ? ((b / 255 - r / 255) / d) * 60 + 120
          : ((r / 255 - g / 255) / d) * 60 + 240;

      // Luminance (WCAG)
      const toLinear = (v: number) => {
        const n = v / 255;
        return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
      };
      const luminance =
        0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      const contrastOnWhite = 1.05 / (luminance + 0.05);
      const contrastOnBlack = (luminance + 0.05) / 0.05;

      return {
        success: true,
        data: {
          hex,
          rgb: { r, g, b },
          rgb_string: `rgb(${r}, ${g}, ${b})`,
          hsl: {
            h: Math.round(h60),
            s: Math.round(s * 100),
            l: Math.round(l * 100),
          },
          hsl_string: `hsl(${Math.round(h60)}, ${Math.round(
            s * 100
          )}%, ${Math.round(l * 100)}%)`,
          luminance: parseFloat(luminance.toFixed(4)),
          is_light: l > 0.5,
          contrast_on_white: parseFloat(contrastOnWhite.toFixed(2)),
          contrast_on_black: parseFloat(contrastOnBlack.toFixed(2)),
        },
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
);

/** ─── format_table ───────────────────────────────────────────────── */

const formatTable = createTool(
  {
    name: 'format_table',
    description: 'Format rows of data into a Markdown table or CSV string.',
    category: 'formatter',
    tags: ['table', 'format', 'markdown', 'csv'],
    parameters: {
      type: 'object',
      properties: {
        headers: {
          type: 'array',
          description: 'Column headers',
          items: { type: 'string' },
        },
        rows: {
          type: 'array',
          description:
            'Array of row arrays (each row is an array of strings or numbers)',
          items: {
            type: 'array',
            items: { type: 'string', description: 'Cell value' },
          },
        },
        format: {
          type: 'string',
          enum: ['markdown', 'csv', 'tsv'],
          description: 'Output format. Default: markdown',
        },
        align: {
          type: 'string',
          enum: ['left', 'right', 'center'],
          description: 'Column alignment for Markdown. Default: left',
        },
      },
      required: ['headers', 'rows'],
    },
  },
  async (params) => {
    const headers = params.headers as string[];
    const rows = params.rows as string[][];
    const format = (params.format as string) ?? 'markdown';
    const align = (params.align as string) ?? 'left';

    if (format === 'csv') {
      const escape = (v: string) =>
        v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      const lines = [
        headers.map(escape).join(','),
        ...rows.map((r) => r.map(escape).join(',')),
      ];
      return {
        success: true,
        data: {
          result: lines.join('\n'),
          format: 'csv',
          rows: rows.length,
          columns: headers.length,
        },
      };
    }

    if (format === 'tsv') {
      const lines = [headers.join('\t'), ...rows.map((r) => r.join('\t'))];
      return {
        success: true,
        data: {
          result: lines.join('\n'),
          format: 'tsv',
          rows: rows.length,
          columns: headers.length,
        },
      };
    }

    // Markdown
    const alignChar =
      align === 'right' ? '--:' : align === 'center' ? ':-:' : ':--';
    const allRows = [headers, ...rows];
    const colWidths = headers.map((_, ci) =>
      Math.max(...allRows.map((r) => String(r[ci] ?? '').length))
    );

    const pad = (v: string, w: number) =>
      align === 'right'
        ? v.padStart(w)
        : align === 'center'
        ? v.padStart(Math.ceil((w + v.length) / 2)).padEnd(w)
        : v.padEnd(w);

    const separator = `| ${colWidths.map(() => alignChar).join(' | ')} |`;
    const headerRow = `| ${headers
      .map((h, i) => pad(h, colWidths[i]))
      .join(' | ')} |`;
    const dataRows = rows.map(
      (r) =>
        `| ${headers
          .map((_, i) => pad(String(r[i] ?? ''), colWidths[i]))
          .join(' | ')} |`
    );

    return {
      success: true,
      data: {
        result: [headerRow, separator, ...dataRows].join('\n'),
        format: 'markdown',
        rows: rows.length,
        columns: headers.length,
      },
    };
  }
);

/** ─── count_tokens ───────────────────────────────────────────────── */

const countTokens = createTool(
  {
    name: 'count_tokens',
    description:
      'Estimate the token count of a text string (GPT-4 tokenizer approximation) and provide character/word statistics.',
    category: 'formatter',
    tags: ['tokens', 'llm', 'count'],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Input text to analyze' },
      },
      required: ['text'],
    },
  },
  async (params) => {
    const text = params.text as string;
    // GPT-4 approximation: ~4 chars per token for English, but accounts for code/punctuation
    // A more accurate heuristic: split on word boundaries + punctuation
    const words = text.trim() === '' ? [] : text.trim().split(/\s+/);
    const chars = text.length;
    // Rough token estimate: words * 1.3 for subword tokenization (code/special chars cost more)
    const codeChars = (text.match(/[{}\[\]()=><!;:,\/\\]/g) || []).length;
    const estimatedTokens = Math.ceil(
      words.length * 1.3 +
        codeChars * 0.2 +
        (chars - words.join('').length) * 0.1
    );

    const lines = text.split('\n').length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const avgWordLen =
      words.length > 0
        ? (words.reduce((s, w) => s + w.length, 0) / words.length).toFixed(1)
        : 0;

    return {
      success: true,
      data: {
        chars,
        chars_no_spaces: text.replace(/\s/g, '').length,
        words: words.length,
        lines,
        sentences,
        avg_word_length: avgWordLen,
        estimated_tokens: estimatedTokens,
        estimated_tokens_gpt4: Math.ceil(chars / 4),
        note: 'Token count is an approximation. Actual may vary by model and content type.',
      },
    };
  }
);

/** ─── case_convert ───────────────────────────────────────────────── */

const caseConvert = createTool(
  {
    name: 'case_convert',
    description:
      'Convert text between different cases: camelCase, snake_case, PascalCase, kebab-case, SCREAMING_SNAKE, Title Case, sentence case.',
    category: 'formatter',
    tags: ['case', 'naming', 'format'],
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input text to convert' },
        to: {
          type: 'string',
          enum: [
            'camel',
            'pascal',
            'snake',
            'screaming_snake',
            'kebab',
            'title',
            'sentence',
            'upper',
            'lower',
            'dot',
            'path',
          ],
          description: 'Target case format',
        },
      },
      required: ['input', 'to'],
    },
  },
  async (params) => {
    const input = params.input as string;
    const to = params.to as string;

    // Tokenize: split on common separators and camelCase/PascalCase boundaries
    const words = input
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_\-./\\]+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase());

    if (words.length === 0)
      return {
        success: false,
        error: 'Input produced no words after normalization',
      };

    let result: string;
    switch (to) {
      case 'camel':
        result =
          words[0] +
          words
            .slice(1)
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join('');
        break;
      case 'pascal':
        result = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
        break;
      case 'snake':
        result = words.join('_');
        break;
      case 'screaming_snake':
        result = words.join('_').toUpperCase();
        break;
      case 'kebab':
        result = words.join('-');
        break;
      case 'title':
        result = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
        break;
      case 'sentence':
        result = words.join(' ');
        result = result[0].toUpperCase() + result.slice(1);
        break;
      case 'upper':
        result = input.toUpperCase();
        break;
      case 'lower':
        result = input.toLowerCase();
        break;
      case 'dot':
        result = words.join('.');
        break;
      case 'path':
        result = words.join('/');
        break;
      default:
        return { success: false, error: `Unknown case: ${to}` };
    }

    return { success: true, data: { input, format: to, result, words } };
  }
);

// Register all formatter tools
const registry = getToolRegistry();
registry.register(formatJson);
registry.register(validateJson);
registry.register(diffText);
registry.register(encodeDecode);
registry.register(getColorInfo);
registry.register(formatTable);
registry.register(countTokens);
registry.register(caseConvert);

export {
  formatJson,
  validateJson,
  diffText,
  encodeDecode,
  getColorInfo,
  formatTable,
  countTokens,
  caseConvert,
};
