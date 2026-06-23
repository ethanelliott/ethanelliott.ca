import { Router } from 'express';
import { allPromise, getDB, getPromise } from '../db';
import { getPageContext } from '../page-data';
import { isUpdateInProgress, updateDatabase } from '../scraper';

const router = Router();

// Stored blobs are mostly JPEG, but f_auto/browser-negotiated downloads can
// produce WebP or PNG — sniff magic bytes instead of assuming.
function detectImageContentType(buf: Buffer): string {
  if (buf.length >= 12) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (buf.toString('ascii', 4, 12) === 'ftypavif') return 'image/avif';
    if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  }
  return 'image/jpeg';
}

router.get('/api', (req, res) => {
  res.send('Aritzia Scanner');
});

router.get('/api/stats', async (req, res) => {
  const db = getDB();
  const { stats } = await getPageContext(db);
  res.json(stats);
});

router.get('/api/products', async (req, res) => {
  const db = getDB();
  const products = await allPromise.call(
    db,
    `SELECT id, name, display_name, rating, review_count FROM products ORDER BY name`
  );
  res.json(products);
});

router.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  const db = getDB();

  const product = await getPromise.call(
    db,
    `SELECT * FROM products WHERE id = ?`,
    [productId]
  );

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const variants = await allPromise.call(
    db,
    `SELECT * FROM variants WHERE product_id = ? ORDER BY color, length`,
    [productId]
  );

  // Batch fetch all images for all variants in one query
  const variantIds = variants.map((v: any) => v.id);
  const allImages =
    variantIds.length > 0
      ? await allPromise.call(
          db,
          `SELECT id, product_id, variant_id FROM images WHERE variant_id IN (${variantIds
            .map(() => '?')
            .join(',')})`,
          variantIds
        )
      : [];

  // Group images by variant_id
  const imagesByVariant = new Map<string, any[]>();
  allImages.forEach((img: any) => {
    if (!imagesByVariant.has(img.variant_id))
      imagesByVariant.set(img.variant_id, []);
    imagesByVariant.get(img.variant_id)!.push({
      id: img.id,
      product_id: img.product_id,
      variant_id: img.variant_id,
    });
  });

  for (const variant of variants) {
    variant.images = imagesByVariant.get(variant.id) || [];
  }

  res.json({ ...product, variants });
});

router.get('/api/images/:id', async (req, res) => {
  const imageId = req.params.id;
  const db = getDB();

  // Images are immutable BLOBs — answer conditional requests before touching
  // the database.
  if (req.headers['if-none-match'] === `"${imageId}"`) {
    res.setHeader('ETag', `"${imageId}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(304).end();
    return;
  }

  const imageRecord = await getPromise.call(
    db,
    `SELECT id, image FROM images WHERE id = ?`,
    [imageId]
  );

  if (!imageRecord || !imageRecord.image) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  res.setHeader('Content-Type', detectImageContentType(imageRecord.image));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', `"${imageId}"`);
  res.send(imageRecord.image);
});

// POST: triggering a full scrape is a state-changing action, and a GET here
// invites crawlers/prefetchers to kick off scrapes.
router.post('/api/update', async (req, res) => {
  if (isUpdateInProgress()) {
    res.status(409).json({ error: 'Update already in progress' });
    return;
  }
  try {
    await updateDatabase();
    res.json({ status: 'Update completed successfully' });
  } catch (error) {
    console.error('Error during update:', error);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.get('/api/history/:variant_id', async (req, res) => {
  const variantId = req.params.variant_id;
  const db = getDB();

  const history = await allPromise.call(
    db,
    `SELECT price, timestamp FROM prices WHERE variant_id = ? ORDER BY timestamp ASC`,
    [variantId]
  );

  res.json(history);
});

router.get('/api/store-availability/:variant_id', async (req, res) => {
  const variantId = req.params.variant_id;
  const db = getDB();

  const availability = await allPromise.call(
    db,
    `SELECT sa.store_id, sa.available_sizes, s.name as store_name, s.city, s.province
     FROM store_availability sa
     LEFT JOIN stores s ON sa.store_id = s.id
     WHERE sa.variant_id = ?
     ORDER BY s.province, s.city`,
    [variantId]
  );

  res.json(availability);
});

router.get('/api/search', async (req, res) => {
  const query = (req.query.q as string) || '';
  const db = getDB();

  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  const results = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count,
            (SELECT thumbnail_id FROM variants WHERE product_id = p.id AND thumbnail_id IS NOT NULL LIMIT 1) as thumbnail_id
     FROM products p
     WHERE p.name LIKE ? OR p.display_name LIKE ? OR p.description LIKE ?
     ORDER BY p.review_count DESC
     LIMIT 20`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );

  res.json(results);
});

// Products added since a given scan time, for the "New to Me" page. The client
// tracks the last scan it acknowledged in localStorage and asks for everything
// newer. Returns lightweight card data, newest first.
router.get('/api/new-products', async (req, res) => {
  const since = (req.query.since as string) || '';
  const db = getDB();
  const { lastScanTime } = await getPageContext(db);

  const products = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count, p.added_at,
            (SELECT thumbnail_id FROM variants WHERE product_id = p.id AND thumbnail_id IS NOT NULL LIMIT 1) as thumbnail_id,
            COALESCE(MIN(CASE WHEN v.last_seen_at >= ? THEN v.price END), MIN(v.price)) as price,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 0 ELSE 1 END as isDiscontinued
     FROM products p
     LEFT JOIN variants v ON v.product_id = p.id
     WHERE p.added_at > ?
     GROUP BY p.id
     ORDER BY p.added_at DESC, p.review_count DESC
     LIMIT 500`,
    [lastScanTime, lastScanTime, since]
  );

  res.json(products);
});

// Count of products added since a given scan time, for the nav badge.
router.get('/api/new-count', async (req, res) => {
  const since = (req.query.since as string) || '';
  const db = getDB();
  const row = await getPromise.call(
    db,
    `SELECT COUNT(*) as count FROM products WHERE added_at > ?`,
    [since]
  );
  res.json({ count: row?.count || 0 });
});

// Fetch variants by IDs (for the favorites page)
router.get('/api/variants', async (req, res) => {
  const ids = ((req.query.ids as string) || '').split(',').filter(Boolean);
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const db = getDB();
  const placeholders = ids.map(() => '?').join(',');
  const variants = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price,
            v.available_sizes, v.product_id, v.thumbnail_id,
            p.name, p.display_name, p.brand, p.slug, p.rating, p.review_count
     FROM variants v
     JOIN products p ON v.product_id = p.id
     WHERE v.id IN (${placeholders})`,
    ids
  );
  res.json(variants);
});

export default router;
