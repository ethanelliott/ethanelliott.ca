import express from 'express';
import cron from 'node-cron';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';
import path from 'path';
import { fileURLToPath } from 'url';
import 'ejs'; // Force inclusion in generated package.json
import { allPromise, closeDB, getDB, getPromise, setupDatabase } from './db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { closeBrowser, updateDatabase } from './scraper';
import aiRoutes from './ai-routes';

dayjs.extend(relativeTime);
dayjs.extend(utc);

const PORT = process.env.PORT || 3000;

// Helper to get last scan time
async function getLastScanTime(db: any): Promise<string> {
  const lastScanRow = await getPromise.call(
    db,
    'SELECT MAX(last_seen_at) as max_time FROM variants'
  );
  return lastScanRow ? lastScanRow.max_time : new Date().toISOString();
}

// Helper to get stats
async function getStats(db: any) {
  const productCount = await getPromise.call(
    db,
    'SELECT COUNT(*) as count FROM products'
  );
  const variantCount = await getPromise.call(
    db,
    'SELECT COUNT(*) as count FROM variants'
  );
  const lastScanTime = await getLastScanTime(db);
  return {
    productCount: productCount?.count || 0,
    variantCount: variantCount?.count || 0,
    lastScanTime,
    lastScanFormatted: dayjs.utc(lastScanTime).fromNow(),
  };
}

async function main() {
  const db = getDB();
  await setupDatabase(db);

  // Initial update in background
  updateDatabase()
    .then(() => console.log('Initial database update completed.'))
    .catch((error) => console.error('Initial database update failed:', error));

  cron.schedule('*/30 * * * *', async () => {
    console.log('Scheduled task started: Updating database...');
    try {
      await updateDatabase();
      console.log('Scheduled database update completed successfully.');
    } catch (error) {
      console.error('Error during scheduled database update:', error);
    }
  });

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(aiRoutes);

  // ==================== API ROUTES ====================

  app.get('/api', (req, res) => {
    res.send('Aritzia Scanner');
  });

  app.get('/api/stats', async (req, res) => {
    const db = getDB();
    const stats = await getStats(db);
    res.json(stats);
  });

  app.get('/api/products', async (req, res) => {
    const db = getDB();
    const products = await allPromise.call(
      db,
      `SELECT id, name, display_name, rating, review_count FROM products ORDER BY name`
    );
    res.json(products);
  });

  app.get('/api/products/:id', async (req, res) => {
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
      imagesByVariant
        .get(img.variant_id)!
        .push({
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

  app.get('/api/images/:id', async (req, res) => {
    const imageId = req.params.id;
    const db = getDB();

    const imageRecord = await getPromise.call(
      db,
      `SELECT id, image FROM images WHERE id = ?`,
      [imageId]
    );

    if (!imageRecord || !imageRecord.image) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    // Images are immutable BLOBs - cache aggressively
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${imageId}"`);

    if (req.headers['if-none-match'] === `"${imageId}"`) {
      res.status(304).end();
      return;
    }

    res.send(imageRecord.image);
  });

  app.get('/api/update', async (req, res) => {
    try {
      await updateDatabase();
      res.json({ status: 'Update completed successfully' });
    } catch (error) {
      console.error('Error during update:', error);
      res.status(500).json({ error: 'Update failed' });
    }
  });

  app.get('/api/history/:variant_id', async (req, res) => {
    const variantId = req.params.variant_id;
    const db = getDB();

    const history = await allPromise.call(
      db,
      `SELECT price, timestamp FROM prices WHERE variant_id = ? ORDER BY timestamp ASC`,
      [variantId]
    );

    res.json(history);
  });

  app.get('/api/store-availability/:variant_id', async (req, res) => {
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

  app.get('/api/search', async (req, res) => {
    const query = (req.query.q as string) || '';
    const db = getDB();

    if (!query || query.length < 2) {
      res.json([]);
      return;
    }

    const results = await allPromise.call(
      db,
      `SELECT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count,
              (SELECT id FROM images WHERE product_id = p.id LIMIT 1) as thumbnail_id
       FROM products p
       WHERE p.name LIKE ? OR p.display_name LIKE ? OR p.description LIKE ?
       ORDER BY p.review_count DESC
       LIMIT 20`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );

    res.json(results);
  });

  // ==================== WEB ROUTES ====================

  // Homepage - Newest variants with search, filters, sorting
  app.get('/', async (req, res) => {
    const db = getDB();
    const brandFilter = req.query.brand as string;
    const fitFilter = req.query.fit as string;
    const categoryFilter = req.query.category as string;
    const sizeFilter = req.query.size as string;
    const sortBy = (req.query.sort as string) || 'newest';
    const searchQuery = req.query.q as string;
    const minPrice = req.query.minPrice
      ? parseFloat(req.query.minPrice as string)
      : null;
    const maxPrice = req.query.maxPrice
      ? parseFloat(req.query.maxPrice as string)
      : null;

    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    let sql = `
      SELECT v.id, v.color, v.color_id, v.length, v.added_at, v.price, v.list_price, 
             v.available_sizes, v.all_sizes, v.swatch, v.ref_color,
             p.name, p.display_name, p.brand, p.id as product_id, p.slug, 
             p.rating, p.review_count, p.category, p.sustainability,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE v.last_seen_at = ?
    `;
    const params: any[] = [lastScanTime];

    if (searchQuery) {
      sql += ` AND (p.name LIKE ? OR p.display_name LIKE ? OR v.color LIKE ?)`;
      params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    if (brandFilter) {
      sql += ` AND p.brand = ?`;
      params.push(brandFilter);
    }

    if (fitFilter) {
      sql += ` AND p.fit LIKE ?`;
      params.push(`%${fitFilter}%`);
    }

    if (categoryFilter) {
      sql += ` AND p.category LIKE ?`;
      params.push(`%${categoryFilter}%`);
    }

    if (sizeFilter) {
      sql += ` AND v.available_sizes LIKE ?`;
      params.push(`%${sizeFilter}%`);
    }

    if (minPrice !== null) {
      sql += ` AND v.price >= ?`;
      params.push(minPrice);
    }

    if (maxPrice !== null) {
      sql += ` AND v.price <= ?`;
      params.push(maxPrice);
    }

    // Sorting
    switch (sortBy) {
      case 'price-low':
        sql += ` ORDER BY v.price ASC`;
        break;
      case 'price-high':
        sql += ` ORDER BY v.price DESC`;
        break;
      case 'rating':
        sql += ` ORDER BY p.rating DESC, p.review_count DESC`;
        break;
      case 'reviews':
        sql += ` ORDER BY p.review_count DESC`;
        break;
      case 'discount':
        sql += ` ORDER BY ((v.list_price - v.price) / v.list_price) DESC`;
        break;
      case 'newest':
      default:
        sql += ` ORDER BY v.added_at DESC`;
        break;
    }

    sql += ` LIMIT 100`;

    const variants = await allPromise.call(db, sql, params);

    // Fetch filter options
    const brands = await allPromise.call(
      db,
      `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`
    );

    const allFitsRows = await allPromise.call(
      db,
      `SELECT fit FROM products WHERE fit IS NOT NULL`
    );
    const fitsSet = new Set<string>();
    allFitsRows.forEach((row: any) => {
      try {
        const fits = JSON.parse(row.fit);
        if (Array.isArray(fits)) {
          fits.forEach((f: string) => fitsSet.add(f));
        }
      } catch (e) {
        /* ignore */
      }
    });

    const allCategoryRows = await allPromise.call(
      db,
      `SELECT category FROM products WHERE category IS NOT NULL`
    );
    const categorySet = new Set<string>();
    allCategoryRows.forEach((row: any) => {
      try {
        const cats = JSON.parse(row.category);
        if (Array.isArray(cats)) {
          cats.forEach((c: string) => categorySet.add(c));
        }
      } catch (e) {
        /* ignore */
      }
    });

    // All possible sizes
    const sizes = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

    // Format dates and parse JSON fields
    variants.forEach((v: any) => {
      v.added_at_formatted = dayjs.utc(v.added_at).fromNow();
      v.isVariant = true;
      v.available_sizes_arr = v.available_sizes
        ? JSON.parse(v.available_sizes)
        : [];
      v.sustainability_arr = v.sustainability
        ? JSON.parse(v.sustainability)
        : [];
      v.category_arr = v.category ? JSON.parse(v.category) : [];
    });

    res.render('index', {
      activeProducts: variants,
      discontinuedProducts: [],
      title: 'Newest Variants',
      showAllLink: true,
      brands: brands.map((b: any) => b.brand),
      currentBrand: brandFilter,
      fits: Array.from(fitsSet).sort(),
      currentFit: fitFilter,
      categories: Array.from(categorySet).sort(),
      currentCategory: categoryFilter,
      sizes,
      currentSize: sizeFilter,
      currentSort: sortBy,
      searchQuery,
      minPrice,
      maxPrice,
      stats,
    });
  });

  // All products page
  app.get('/products', async (req, res) => {
    const db = getDB();
    const brandFilter = req.query.brand as string;
    const fitFilter = req.query.fit as string;
    const categoryFilter = req.query.category as string;
    const sortBy = (req.query.sort as string) || 'name';
    const searchQuery = req.query.q as string;

    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    let sql = `
      SELECT p.id, p.name, p.display_name, p.slug, p.brand, p.rating, p.review_count, 
             p.category, p.sustainability,
             (SELECT id FROM images WHERE product_id = p.id LIMIT 1) as thumbnail_id,
             CASE WHEN MAX(v.last_seen_at) = ? THEN 0 ELSE 1 END as isDiscontinued,
             MIN(v.price) as min_price,
             MAX(v.list_price) as max_price
      FROM products p
      LEFT JOIN variants v ON p.id = v.product_id
      WHERE 1=1
    `;
    const params: any[] = [lastScanTime];

    if (searchQuery) {
      sql += ` AND (p.name LIKE ? OR p.display_name LIKE ? OR p.description LIKE ?)`;
      params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    if (brandFilter) {
      sql += ` AND p.brand = ?`;
      params.push(brandFilter);
    }

    if (fitFilter) {
      sql += ` AND p.fit LIKE ?`;
      params.push(`%${fitFilter}%`);
    }

    if (categoryFilter) {
      sql += ` AND p.category LIKE ?`;
      params.push(`%${categoryFilter}%`);
    }

    sql += ` GROUP BY p.id, p.name, p.slug`;

    // Sorting
    switch (sortBy) {
      case 'price-low':
        sql += ` ORDER BY min_price ASC`;
        break;
      case 'price-high':
        sql += ` ORDER BY min_price DESC`;
        break;
      case 'rating':
        sql += ` ORDER BY p.rating DESC, p.review_count DESC`;
        break;
      case 'reviews':
        sql += ` ORDER BY p.review_count DESC`;
        break;
      case 'name':
      default:
        sql += ` ORDER BY p.name`;
        break;
    }

    const allProducts = await allPromise.call(db, sql, params);

    // Fetch filter options
    const brands = await allPromise.call(
      db,
      `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`
    );

    const allFitsRows = await allPromise.call(
      db,
      `SELECT fit FROM products WHERE fit IS NOT NULL`
    );
    const fitsSet = new Set<string>();
    allFitsRows.forEach((row: any) => {
      try {
        const fits = JSON.parse(row.fit);
        if (Array.isArray(fits)) fits.forEach((f: string) => fitsSet.add(f));
      } catch (e) {
        /* ignore */
      }
    });

    const allCategoryRows = await allPromise.call(
      db,
      `SELECT category FROM products WHERE category IS NOT NULL`
    );
    const categorySet = new Set<string>();
    allCategoryRows.forEach((row: any) => {
      try {
        const cats = JSON.parse(row.category);
        if (Array.isArray(cats))
          cats.forEach((c: string) => categorySet.add(c));
      } catch (e) {
        /* ignore */
      }
    });

    // Parse JSON fields
    allProducts.forEach((p: any) => {
      p.sustainability_arr = p.sustainability
        ? JSON.parse(p.sustainability)
        : [];
      p.category_arr = p.category ? JSON.parse(p.category) : [];
    });

    const activeProducts = allProducts.filter((p: any) => !p.isDiscontinued);
    const discontinuedProducts = allProducts.filter(
      (p: any) => p.isDiscontinued
    );

    res.render('index', {
      activeProducts,
      discontinuedProducts,
      title: 'All Products',
      showAllLink: false,
      brands: brands.map((b: any) => b.brand),
      currentBrand: brandFilter,
      fits: Array.from(fitsSet).sort(),
      currentFit: fitFilter,
      categories: Array.from(categorySet).sort(),
      currentCategory: categoryFilter,
      sizes: [],
      currentSize: null,
      currentSort: sortBy,
      searchQuery,
      minPrice: null,
      maxPrice: null,
      stats,
    });
  });

  // Sale page
  app.get('/sale', async (req, res) => {
    const db = getDB();
    const sizeFilter = req.query.size as string;
    const sortBy = (req.query.sort as string) || 'discount';
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    let sql = `
      SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price, v.available_sizes,
             v.swatch, v.ref_color,
             p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE v.last_seen_at = ? AND v.price < v.list_price
    `;
    const params: any[] = [lastScanTime];

    if (sizeFilter) {
      sql += ` AND v.available_sizes LIKE ?`;
      params.push(`%${sizeFilter}%`);
    }

    switch (sortBy) {
      case 'price-low':
        sql += ` ORDER BY v.price ASC`;
        break;
      case 'price-high':
        sql += ` ORDER BY v.price DESC`;
        break;
      case 'discount':
      default:
        sql += ` ORDER BY ((v.list_price - v.price) / v.list_price) DESC`;
        break;
    }

    const saleItems = await allPromise.call(db, sql, params);

    saleItems.forEach((item: any) => {
      item.available_sizes_arr = item.available_sizes
        ? JSON.parse(item.available_sizes)
        : [];
      item.discount_percent = Math.round(
        (1 - item.price / item.list_price) * 100
      );
    });

    const sizes = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

    res.render('sale', {
      saleItems,
      title: 'On Sale',
      sizes,
      currentSize: sizeFilter,
      currentSort: sortBy,
      stats,
    });
  });

  // Product detail page
  app.get('/product/:id', async (req, res) => {
    const productId = req.params.id;
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const product = await getPromise.call(
      db,
      `SELECT * FROM products WHERE id = ?`,
      [productId]
    );

    if (!product) {
      res.status(404).send('Product not found');
      return;
    }

    const variants = await allPromise.call(
      db,
      `SELECT * FROM variants WHERE product_id = ? ORDER BY color, length`,
      [productId]
    );

    const groupedVariants = new Map<string, any>();
    const allLengths = new Set<string>();

    for (const variant of variants) {
      if (!groupedVariants.has(variant.color)) {
        groupedVariants.set(variant.color, {
          color: variant.color,
          color_id: variant.color_id.split('_')[0],
          lengths: [],
          added_at: variant.added_at,
          last_seen_at: variant.last_seen_at,
          lastSeenAts: [],
          thumbnail: null,
          price: variant.price,
          list_price: variant.list_price,
          lowest_price: variant.price,
          available_sizes: variant.available_sizes
            ? JSON.parse(variant.available_sizes)
            : [],
          all_sizes: variant.all_sizes ? JSON.parse(variant.all_sizes) : [],
          swatch: variant.swatch,
          ref_color: variant.ref_color,
        });
      }

      const group = groupedVariants.get(variant.color);
      if (!group.lengths.includes(variant.length)) {
        group.lengths.push(variant.length);
        allLengths.add(variant.length);
      }
      group.lastSeenAts.push(variant.last_seen_at);
    }

    // Batch: get lowest prices for all variants at once
    const variantIdsForProduct = variants.map((v: any) => v.id);
    const lowestPrices =
      variantIdsForProduct.length > 0
        ? await allPromise.call(
            db,
            `SELECT variant_id, MIN(price) as min_price FROM prices WHERE variant_id IN (${variantIdsForProduct
              .map(() => '?')
              .join(',')}) GROUP BY variant_id`,
            variantIdsForProduct
          )
        : [];
    const lowestPriceMap = new Map<string, number>();
    lowestPrices.forEach((r: any) =>
      lowestPriceMap.set(r.variant_id, r.min_price)
    );

    // Batch: get first thumbnail image per variant
    const thumbnailImages =
      variantIdsForProduct.length > 0
        ? await allPromise.call(
            db,
            `SELECT variant_id, MIN(id) as image_id FROM images WHERE variant_id IN (${variantIdsForProduct
              .map(() => '?')
              .join(',')}) GROUP BY variant_id`,
            variantIdsForProduct
          )
        : [];
    const thumbnailMap = new Map<string, string>();
    thumbnailImages.forEach((r: any) =>
      thumbnailMap.set(r.variant_id, r.image_id)
    );

    // Apply batch results to grouped variants
    for (const variant of variants) {
      const group = groupedVariants.get(variant.color);
      const minPrice = lowestPriceMap.get(variant.id);
      if (minPrice !== undefined && minPrice < group.lowest_price) {
        group.lowest_price = minPrice;
      }
      if (!group.thumbnail && thumbnailMap.has(variant.id)) {
        group.thumbnail = thumbnailMap.get(variant.id);
      }
    }

    for (const group of groupedVariants.values()) {
      group.isActive = group.lastSeenAts.some(
        (lastSeen: string) => lastSeen === lastScanTime
      );
      delete group.lastSeenAts;
    }

    res.render('product', {
      product: {
        ...product,
        fabric: product.fabric ? JSON.parse(product.fabric) : [],
        warmth: product.warmth ? JSON.parse(product.warmth) : [],
        category: product.category ? JSON.parse(product.category) : [],
        sustainability: product.sustainability
          ? JSON.parse(product.sustainability)
          : [],
        neckline: product.neckline ? JSON.parse(product.neckline) : [],
        sleeve: product.sleeve ? JSON.parse(product.sleeve) : [],
        style: product.style ? JSON.parse(product.style) : [],
        added_at_formatted: dayjs.utc(product.added_at).fromNow(),
        last_seen_at_formatted: dayjs.utc(product.last_seen_at).fromNow(),
        variants: Array.from(groupedVariants.values()),
        allLengths: Array.from(allLengths).sort(),
      },
      stats,
    });
  });

  // Variant detail page
  app.get('/product/:id/variant/:color_id', async (req, res) => {
    const { id: productId, color_id: colorId } = req.params;
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const product = await getPromise.call(
      db,
      `SELECT * FROM products WHERE id = ?`,
      [productId]
    );

    if (!product) {
      res.status(404).send('Product not found');
      return;
    }

    const variants = await allPromise.call(
      db,
      `SELECT * FROM variants WHERE product_id = ? AND (color_id = ? OR color_id LIKE ?) ORDER BY length`,
      [productId, colorId, `${colorId}_%`]
    );

    if (variants.length === 0) {
      res.status(404).send('Variant not found');
      return;
    }

    const distinctLengths = await allPromise.call(
      db,
      `SELECT DISTINCT length FROM variants WHERE product_id = ?`,
      [productId]
    );
    const hasMultipleLengths = distinctLengths.length > 1;

    const images = new Map<string, any>();

    // Batch: get lowest prices for all variant IDs
    const variantDetailIds = variants.map((v: any) => v.id);
    const batchLowestPrices =
      variantDetailIds.length > 0
        ? await allPromise.call(
            db,
            `SELECT variant_id, MIN(price) as min_price FROM prices WHERE variant_id IN (${variantDetailIds
              .map(() => '?')
              .join(',')}) GROUP BY variant_id`,
            variantDetailIds
          )
        : [];
    const lowestPriceMapDetail = new Map<string, number>();
    batchLowestPrices.forEach((r: any) =>
      lowestPriceMapDetail.set(r.variant_id, r.min_price)
    );

    // Batch: get all images for all variants
    const batchImages =
      variantDetailIds.length > 0
        ? await allPromise.call(
            db,
            `SELECT id, variant_id FROM images WHERE variant_id IN (${variantDetailIds
              .map(() => '?')
              .join(',')})`,
            variantDetailIds
          )
        : [];

    batchImages.forEach((img: any) => {
      if (!images.has(img.id)) {
        images.set(img.id, img);
      }
    });

    for (const variant of variants) {
      variant.added_at_formatted = dayjs.utc(variant.added_at).fromNow();
      variant.last_seen_at_formatted = dayjs
        .utc(variant.last_seen_at)
        .fromNow();
      variant.isActive = variant.last_seen_at === lastScanTime;
      variant.available_sizes = variant.available_sizes
        ? JSON.parse(variant.available_sizes)
        : [];
      variant.all_sizes = variant.all_sizes
        ? JSON.parse(variant.all_sizes)
        : [];

      const minPrice = lowestPriceMapDetail.get(variant.id);
      variant.lowest_price = minPrice !== undefined ? minPrice : variant.price;
    }

    // Get store availability for this variant
    const storeAvailability = await allPromise.call(
      db,
      `SELECT sa.store_id, sa.available_sizes, s.name as store_name, s.city, s.province
       FROM store_availability sa
       LEFT JOIN stores s ON sa.store_id = s.id
       WHERE sa.variant_id LIKE ?
       ORDER BY s.province, s.city`,
      [`${productId}-${colorId}%`]
    );

    storeAvailability.forEach((sa: any) => {
      sa.sizes = sa.available_sizes ? JSON.parse(sa.available_sizes) : [];
    });

    res.render('variant', {
      product: {
        ...product,
        fabric: product.fabric ? JSON.parse(product.fabric) : [],
        warmth: product.warmth ? JSON.parse(product.warmth) : [],
        category: product.category ? JSON.parse(product.category) : [],
        sustainability: product.sustainability
          ? JSON.parse(product.sustainability)
          : [],
        neckline: product.neckline ? JSON.parse(product.neckline) : [],
        sleeve: product.sleeve ? JSON.parse(product.sleeve) : [],
        style: product.style ? JSON.parse(product.style) : [],
      },
      color: variants[0].color,
      color_id: colorId,
      variants,
      images: Array.from(images.values()),
      hasMultipleLengths,
      storeAvailability,
      stats,
    });
  });

  // Colors page
  app.get('/colors', async (req, res) => {
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const colors = await allPromise.call(
      db,
      `SELECT DISTINCT v.color, v.color_id, v.ref_color, v.swatch,
              MIN(v.added_at) as first_seen_at,
              COUNT(*) as variant_count,
              CASE WHEN MAX(v.last_seen_at) = ? THEN 1 ELSE 0 END as is_active
       FROM variants v
       GROUP BY v.color, v.color_id
       ORDER BY variant_count DESC, v.color`,
      [lastScanTime]
    );

    for (const color of colors) {
      const thumbnail = await getPromise.call(
        db,
        `SELECT i.id as image_id, p.name as product_name
         FROM images i
         JOIN variants v ON i.variant_id = v.id
         JOIN products p ON v.product_id = p.id
         WHERE v.color = ? AND (i.id LIKE '%off_c' OR i.id LIKE '%off_h')
         LIMIT 1`,
        [color.color]
      );
      color.thumbnail = thumbnail || null;
    }

    colors.forEach((c: any) => {
      c.first_seen_at_formatted = dayjs.utc(c.first_seen_at).fromNow();
    });

    const activeColors = colors.filter((c: any) => c.is_active);
    const inactiveColors = colors.filter((c: any) => !c.is_active);

    res.render('colors', {
      activeColors,
      inactiveColors,
      title: 'All Colors',
      stats,
    });
  });

  // Products by color
  app.get('/colors/:color', async (req, res) => {
    const color = decodeURIComponent(req.params.color);
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const allProducts = await allPromise.call(
      db,
      `SELECT DISTINCT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count,
              (SELECT i.id FROM images i
               JOIN variants v ON i.variant_id = v.id
               WHERE v.product_id = p.id AND v.color = ?
               LIMIT 1) as thumbnail_id,
              (SELECT v2.color_id FROM variants v2
               WHERE v2.product_id = p.id AND v2.color = ?
               LIMIT 1) as variant_color_id,
              CASE WHEN MAX(v3.last_seen_at) = ? THEN 0 ELSE 1 END as isDiscontinued
       FROM products p
       JOIN variants v ON p.id = v.product_id
       LEFT JOIN variants v3 ON p.id = v3.product_id
       WHERE v.color = ?
       GROUP BY p.id, p.name, p.slug
       ORDER BY p.review_count DESC, p.name`,
      [color, color, lastScanTime, color]
    );

    const activeProducts = allProducts.filter((p: any) => !p.isDiscontinued);
    const discontinuedProducts = allProducts.filter(
      (p: any) => p.isDiscontinued
    );

    res.render('color_products', {
      activeProducts,
      discontinuedProducts,
      color,
      title: `Products in ${color}`,
      stats,
    });
  });

  // Categories page
  app.get('/categories', async (req, res) => {
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const allCategoryRows = await allPromise.call(
      db,
      `SELECT p.id, p.category, 
              CASE WHEN MAX(v.last_seen_at) = ? THEN 1 ELSE 0 END as is_active
       FROM products p
       LEFT JOIN variants v ON p.id = v.product_id
       WHERE p.category IS NOT NULL
       GROUP BY p.id`,
      [lastScanTime]
    );

    const categoryMap = new Map<
      string,
      { count: number; activeCount: number }
    >();
    allCategoryRows.forEach((row: any) => {
      try {
        const cats = JSON.parse(row.category);
        if (Array.isArray(cats)) {
          cats.forEach((c: string) => {
            if (!categoryMap.has(c)) {
              categoryMap.set(c, { count: 0, activeCount: 0 });
            }
            const entry = categoryMap.get(c)!;
            entry.count++;
            if (row.is_active) entry.activeCount++;
          });
        }
      } catch (e) {
        /* ignore */
      }
    });

    const categories = Array.from(categoryMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.activeCount - a.activeCount);

    res.render('categories', {
      categories,
      title: 'Categories',
      stats,
    });
  });

  // Products by category
  app.get('/categories/:category', async (req, res) => {
    const category = decodeURIComponent(req.params.category);
    const db = getDB();
    const sortBy = (req.query.sort as string) || 'reviews';
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    let sql = `
      SELECT p.id, p.name, p.display_name, p.slug, p.brand, p.rating, p.review_count,
             p.sustainability,
             (SELECT id FROM images WHERE product_id = p.id LIMIT 1) as thumbnail_id,
             CASE WHEN MAX(v.last_seen_at) = ? THEN 0 ELSE 1 END as isDiscontinued,
             MIN(v.price) as price,
             MAX(v.list_price) as list_price
      FROM products p
      LEFT JOIN variants v ON p.id = v.product_id
      WHERE p.category LIKE ?
      GROUP BY p.id
    `;
    const params: any[] = [lastScanTime, `%${category}%`];

    switch (sortBy) {
      case 'price-low':
        sql += ` ORDER BY price ASC`;
        break;
      case 'price-high':
        sql += ` ORDER BY price DESC`;
        break;
      case 'rating':
        sql += ` ORDER BY p.rating DESC`;
        break;
      case 'reviews':
      default:
        sql += ` ORDER BY p.review_count DESC`;
        break;
    }

    const allProducts = await allPromise.call(db, sql, params);

    allProducts.forEach((p: any) => {
      p.sustainability_arr = p.sustainability
        ? JSON.parse(p.sustainability)
        : [];
    });

    const activeProducts = allProducts.filter((p: any) => !p.isDiscontinued);
    const discontinuedProducts = allProducts.filter(
      (p: any) => p.isDiscontinued
    );

    res.render('category_products', {
      activeProducts,
      discontinuedProducts,
      category,
      title: category,
      currentSort: sortBy,
      stats,
    });
  });

  // Restocks page
  app.get('/restocks', async (req, res) => {
    const db = getDB();
    const stats = await getStats(db);

    const restocks = await allPromise.call(
      db,
      `SELECT r.timestamp, v.id, v.color, v.color_id, v.length, v.price, v.list_price,
              v.available_sizes, v.swatch,
              p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count,
              COALESCE(
                (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
                (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
              ) as thumbnail_id
       FROM restocks r
       JOIN variants v ON r.variant_id = v.id
       JOIN products p ON v.product_id = p.id
       ORDER BY r.timestamp DESC
       LIMIT 50`
    );

    restocks.forEach((r: any) => {
      r.added_at_formatted = dayjs.utc(r.timestamp).fromNow();
      r.isVariant = true;
      r.available_sizes_arr = r.available_sizes
        ? JSON.parse(r.available_sizes)
        : [];
    });

    res.render('restocks', {
      restocks,
      title: 'Recent Restocks',
      stats,
    });
  });

  // Discontinued page
  app.get('/discontinued', async (req, res) => {
    const db = getDB();
    const lastScanTime = await getLastScanTime(db);
    const stats = await getStats(db);

    const variants = await allPromise.call(
      db,
      `SELECT v.id, v.color, v.color_id, v.length, v.last_seen_at, v.price, v.list_price,
              v.swatch,
              p.name as product_name, p.display_name, p.id as product_id, p.slug, 
              p.rating, p.review_count,
              COALESCE(
                (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
                (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
              ) as thumbnail_id
       FROM variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.last_seen_at < ?
       ORDER BY v.last_seen_at DESC`,
      [lastScanTime]
    );

    variants.forEach((v: any) => {
      v.last_seen_at_formatted = dayjs.utc(v.last_seen_at).fromNow();
    });

    res.render('discontinued', {
      variants,
      title: 'Discontinued Items',
      stats,
    });
  });

  // Stores page
  app.get('/stores', async (req, res) => {
    const db = getDB();
    const stats = await getStats(db);

    const stores = await allPromise.call(
      db,
      `SELECT s.id, s.name, s.city, s.province, s.country,
              COUNT(DISTINCT sa.variant_id) as variant_count
       FROM stores s
       LEFT JOIN store_availability sa ON s.id = sa.store_id
       GROUP BY s.id
       ORDER BY s.country DESC, s.province, s.city`
    );

    res.render('stores', {
      stores,
      title: 'Store Locations',
      stats,
    });
  });

  // Store detail page
  app.get('/stores/:storeId', async (req, res) => {
    const db = getDB();
    const stats = await getStats(db);
    const storeId = req.params.storeId;
    const { size: sizeFilter, sort = 'name' } = req.query as {
      size?: string;
      sort?: string;
    };

    // Get store info
    const store = await getPromise.call(
      db,
      `SELECT * FROM stores WHERE id = ?`,
      [storeId]
    );

    if (!store) {
      return res.status(404).send('Store not found');
    }

    // Get all sizes available at this store for filter dropdown
    const sizesRaw = await allPromise.call(
      db,
      `SELECT DISTINCT available_sizes FROM store_availability WHERE store_id = ?`,
      [storeId]
    );
    const sizesSet = new Set<string>();
    sizesRaw.forEach((row: any) => {
      if (row.available_sizes) {
        try {
          const parsed = JSON.parse(row.available_sizes);
          if (Array.isArray(parsed)) {
            parsed.forEach((s: string) => {
              if (s && s.trim()) sizesSet.add(s.trim());
            });
          }
        } catch {
          // Fallback for pipe-delimited format
          String(row.available_sizes)
            .split('|')
            .forEach((s: string) => {
              if (s.trim()) sizesSet.add(s.trim());
            });
        }
      }
    });
    const sizeOrder = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    const sizes = Array.from(sizesSet).sort((a, b) => {
      const aIdx = sizeOrder.indexOf(a);
      const bIdx = sizeOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    // Build query for items at this store
    let query = `
      SELECT DISTINCT
        sa.variant_id,
        sa.color_id,
        sa.available_sizes as store_sizes,
        v.price,
        v.list_price,
        v.color,
        p.id as product_id,
        p.name,
        p.display_name,
        p.slug,
        p.rating,
        (SELECT i.id FROM images i WHERE i.variant_id = sa.variant_id LIMIT 1) as thumbnail_id
      FROM store_availability sa
      JOIN variants v ON v.id = sa.variant_id AND v.color_id = sa.color_id
      JOIN products p ON p.id = v.product_id
      WHERE sa.store_id = ?
    `;

    const params: any[] = [storeId];

    // Filter by size (search for "SIZE" in the JSON array string)
    if (sizeFilter) {
      query += ` AND sa.available_sizes LIKE ?`;
      params.push(`%"${sizeFilter}"%`);
    }

    // Sort
    switch (sort) {
      case 'price-low':
        query += ` ORDER BY v.price ASC`;
        break;
      case 'price-high':
        query += ` ORDER BY v.price DESC`;
        break;
      default:
        query += ` ORDER BY p.name ASC`;
    }

    const items = await allPromise.call(db, query, params);

    res.render('store_detail', {
      store,
      items,
      sizes,
      currentSize: sizeFilter || '',
      currentSort: sort,
      title: store.name !== 'Unknown' ? store.name : `Store #${storeId}`,
      stats,
    });
  });

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });

  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    closeDB();
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
