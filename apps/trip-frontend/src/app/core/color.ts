// Pick a foreground text colour with adequate contrast against a background,
// per WCAG relative-luminance / contrast-ratio formulas.

const DARK = '#1f2430'; // app text-primary
const LIGHT = '#ffffff';

function parseHex(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Returns the text colour (near-black or white) with the higher contrast ratio
 * against `bg` — maximising legibility on any chosen swatch.
 */
export function contrastText(bg: string | null | undefined): string {
  const rgb = parseHex(bg);
  if (!rgb) return LIGHT;
  const bgL = relativeLuminance(rgb);
  const darkL = relativeLuminance([31, 36, 48]);
  const lightL = 1;
  return contrastRatio(bgL, darkL) >= contrastRatio(bgL, lightL) ? DARK : LIGHT;
}
