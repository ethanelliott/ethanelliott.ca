import sqlite3 from 'sqlite3';
import { allPromise } from './db';

// Everything that changed in a single scan, derived entirely from the existing
// added_at / last_seen_at / restocks / prices data — no extra bookkeeping
// tables. `scrapeTime` is the scan to report on; for the live site this is the
// last completed scan time, and for the post-scan notification it's the scan
// that just finished (the same value in both cases).

export type ScanChanges = {
  newProducts: any[];
  newColors: any[];
  restocks: any[];
  priceDrops: any[];
};

export async function getScanChanges(
  db: sqlite3.Database,
  scrapeTime: string
): Promise<ScanChanges> {
  // Brand-new products that first appeared in this scan.
  const newProducts = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count,
            (SELECT thumbnail_id FROM variants WHERE product_id = p.id AND thumbnail_id IS NOT NULL LIMIT 1) as thumbnail_id,
            COALESCE(MIN(CASE WHEN v.last_seen_at >= ? THEN v.price END), MIN(v.price)) as price,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 0 ELSE 1 END as isDiscontinued
     FROM products p
     LEFT JOIN variants v ON v.product_id = p.id
     WHERE p.added_at = ?
     GROUP BY p.id
     ORDER BY p.review_count DESC, p.name`,
    [scrapeTime, scrapeTime, scrapeTime]
  );

  // New colors added to products that already existed before this scan (so they
  // don't double-count with brand-new products). Grouped to one row per color.
  const newColors = await allPromise.call(
    db,
    `SELECT v.product_id, v.color, MIN(v.color_id) as color_id,
            MIN(v.price) as price, MAX(v.list_price) as list_price,
            MAX(v.thumbnail_id) as thumbnail_id,
            p.name, p.display_name, p.rating, p.review_count
     FROM variants v
     JOIN products p ON p.id = v.product_id
     WHERE v.added_at = ? AND p.added_at < ?
     GROUP BY v.product_id, v.color
     ORDER BY p.review_count DESC, p.name`,
    [scrapeTime, scrapeTime]
  );

  // Variants that came back in stock during this scan.
  const restocks = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price,
            v.available_sizes, v.swatch, v.thumbnail_id,
            p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count
     FROM restocks r
     JOIN variants v ON r.variant_id = v.id
     JOIN products p ON v.product_id = p.id
     WHERE r.timestamp = ?
     ORDER BY p.review_count DESC, p.name`,
    [scrapeTime]
  );

  // Price drops this scan: a price-history row stamped with this scan time whose
  // value is below the immediately preceding recorded price, limited to still
  // active variants. Sorted by largest drop first.
  const priceDropRows = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price,
            v.available_sizes, v.swatch, v.thumbnail_id,
            p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count,
            cur.price as new_price,
            (SELECT pp.price FROM prices pp
             WHERE pp.variant_id = cur.variant_id AND pp.timestamp < cur.timestamp
             ORDER BY pp.timestamp DESC LIMIT 1) as old_price
     FROM prices cur
     JOIN variants v ON v.id = cur.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE cur.timestamp = ? AND v.last_seen_at >= ?`,
    [scrapeTime, scrapeTime]
  );

  const priceDrops = priceDropRows
    .filter(
      (r: any) =>
        r.old_price !== null &&
        r.old_price !== undefined &&
        r.new_price < r.old_price
    )
    .sort(
      (a: any, b: any) =>
        b.old_price - b.new_price - (a.old_price - a.new_price)
    );

  return { newProducts, newColors, restocks, priceDrops };
}

export type ScanSummary = {
  total: number;
  title: string;
  body: string;
};

/**
 * Build a compact ntfy message from a set of scan changes. Returns null when
 * nothing changed so the caller can skip notifying.
 */
export function buildScanSummary(changes: ScanChanges): ScanSummary | null {
  const { newProducts, newColors, restocks, priceDrops } = changes;
  const total =
    newProducts.length + newColors.length + restocks.length + priceDrops.length;
  if (total === 0) return null;

  const lines: string[] = [];

  if (newProducts.length > 0) {
    const names = newProducts
      .slice(0, 3)
      .map((p: any) => p.display_name || p.name)
      .join(', ');
    const more = newProducts.length > 3 ? ` +${newProducts.length - 3} more` : '';
    lines.push(
      `🆕 ${newProducts.length} new product${
        newProducts.length === 1 ? '' : 's'
      }: ${names}${more}`
    );
  }
  if (newColors.length > 0) {
    lines.push(
      `🎨 ${newColors.length} new color${newColors.length === 1 ? '' : 's'}`
    );
  }
  if (restocks.length > 0) {
    lines.push(
      `📦 ${restocks.length} restock${restocks.length === 1 ? '' : 's'}`
    );
  }
  if (priceDrops.length > 0) {
    lines.push(
      `💸 ${priceDrops.length} price drop${priceDrops.length === 1 ? '' : 's'}`
    );
  }

  return {
    total,
    title: `Aritzia: ${total} update${total === 1 ? '' : 's'} this scan`,
    body: lines.join('\n'),
  };
}
