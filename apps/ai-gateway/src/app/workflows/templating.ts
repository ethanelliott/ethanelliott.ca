import { TemplateScope } from './workflow.types';

/**
 * Minimal template engine for workflow node configs.
 *
 * Expressions are dot-paths wrapped in double braces:
 *   "{{ input.city }}"            → the run input's city field
 *   "{{ nodes.fetch.data.temp }}" → output of the node with id "fetch"
 *   "{{ run.id }}"                → run metadata
 *
 * Rules:
 * - A string that is EXACTLY one expression resolves to the raw value
 *   (objects, numbers, booleans survive — "{{ nodes.a.items }}" stays an
 *   array). Mixed strings interpolate with String() coercion; objects and
 *   arrays are JSON-stringified.
 * - Unresolvable paths render as empty string (mixed) or undefined (exact).
 * - Objects and arrays are rendered deeply.
 */

const EXACT_EXPR = /^\{\{\s*([\w.$[\]-]+)\s*\}\}$/;
const INLINE_EXPR = /\{\{\s*([\w.$[\]-]+)\s*\}\}/g;

export function resolvePath(scope: TemplateScope, path: string): unknown {
  const segments = path
    // Support bracket indices: items[0] → items.0
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = scope as unknown;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function renderString(template: string, scope: TemplateScope): unknown {
  const exact = template.match(EXACT_EXPR);
  if (exact) {
    return resolvePath(scope, exact[1]);
  }
  return template.replace(INLINE_EXPR, (_match, path: string) =>
    stringify(resolvePath(scope, path))
  );
}

/** Deep-render every string in a value against the scope. */
export function renderDeep(value: unknown, scope: TemplateScope): unknown {
  if (typeof value === 'string') {
    return renderString(value, scope);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderDeep(item, scope));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      out[key] = renderDeep(item, scope);
    }
    return out;
  }
  return value;
}
