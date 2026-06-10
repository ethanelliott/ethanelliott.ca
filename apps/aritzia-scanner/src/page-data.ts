import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';
import sqlite3 from 'sqlite3';
import { getPromise } from './db';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export const SIZES = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

/**
 * available_sizes is a JSON array string like ["2XS","XS","S"]. Matching must
 * include the quotes, otherwise filtering for S also matches XS and 2XS.
 */
export function sizeLikeParam(size: string): string {
  return `%"${size}"%`;
}

export type Stats = {
  productCount: number;
  variantCount: number;
  lastScanTime: string | null;
  lastScanFormatted: string;
};

export type PageContext = {
  lastScanTime: string | null;
  stats: Stats;
};

let cached: { at: number; context: PageContext } | null = null;
const CACHE_TTL_MS = 15_000;

export function invalidatePageContext() {
  cached = null;
}

/**
 * Last *completed* scan time. Variants are active when
 * last_seen_at >= lastScanTime; a scrape that fails midway never completes a
 * scan row, so it can't flip the catalog to discontinued. Falls back to
 * MAX(last_seen_at) for databases that predate the scans table.
 */
async function getLastScanTime(db: sqlite3.Database): Promise<string | null> {
  const scanRow = await getPromise.call(
    db,
    `SELECT MAX(scrape_time) as t FROM scans WHERE completed_at IS NOT NULL`
  );
  if (scanRow?.t) return scanRow.t;
  const row = await getPromise.call(
    db,
    `SELECT MAX(last_seen_at) as t FROM variants`
  );
  return row?.t ?? null;
}

export async function getPageContext(db: sqlite3.Database): Promise<PageContext> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.context;
  }

  const lastScanTime = await getLastScanTime(db);
  const productCount = await getPromise.call(
    db,
    'SELECT COUNT(*) as count FROM products'
  );
  const variantCount = await getPromise.call(
    db,
    'SELECT COUNT(*) as count FROM variants'
  );

  const context: PageContext = {
    lastScanTime,
    stats: {
      productCount: productCount?.count || 0,
      variantCount: variantCount?.count || 0,
      lastScanTime,
      lastScanFormatted: lastScanTime
        ? dayjs.utc(lastScanTime).fromNow()
        : 'never',
    },
  };
  cached = { at: Date.now(), context };
  return context;
}

export function parseJsonArr(value: unknown): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function fmtPrice(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return `$${num.toFixed(2)}`;
}

export function fromNow(timestamp: string | null | undefined): string {
  return timestamp ? dayjs.utc(timestamp).fromNow() : '';
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
  '&hellip;': '…',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&agrave;': 'à',
  '&ccedil;': 'ç',
};

/**
 * Decode HTML entities in scraped text server-side so views can render it
 * escaped with <%= %> instead of raw with <%- %>.
 */
export function decodeEntities(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&[a-z]+;|&#\d+;|&#x[\da-f]+;/gi, (entity) => {
      const lower = entity.toLowerCase();
      if (NAMED_ENTITIES[lower] !== undefined) return NAMED_ENTITIES[lower];
      if (lower.startsWith('&#x')) {
        const code = parseInt(lower.slice(3, -1), 16);
        return Number.isNaN(code) ? entity : String.fromCodePoint(code);
      }
      if (lower.startsWith('&#')) {
        const code = parseInt(lower.slice(2, -1), 10);
        return Number.isNaN(code) ? entity : String.fromCodePoint(code);
      }
      return entity;
    })
    .trim();
}
