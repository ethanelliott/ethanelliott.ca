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

dayjs.extend(relativeTime);
dayjs.extend(utc);

const PORT = process.env.PORT || 3000;

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
  // In the built application, views are copied to the root of the output directory
  // or we can use process.cwd() if we are careful.
  // Using __dirname is safer if we are running the bundled file.
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api', (req, res) => {
    res.send('Aritzia Scanner');
  });

  app.get('/api/products', async (req, res) => {
    const db = getDB();
    const products = await allPromise.call(
      db,
      `
      SELECT id, name
      FROM products
      ORDER BY name
  `
    );
    res.json(products);
  });

  // get product by id with all variants
  app.get('/api/products/:id', async (req, res) => {
    const productId = req.params.id;
    const db = getDB();

    const product = await getPromise.call(
      db,
      `
      SELECT id, name, slug, fabric
      FROM products
      WHERE id = ?
  `,
      [productId]
    );

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const variants = await allPromise.call(
      db,
      `
      SELECT id, color, color_id, length
      FROM variants
      WHERE product_id = ?
      ORDER BY color, length
  `,
      [productId]
    );

    for (const variant of variants) {
      const images = await allPromise.call(
        db,
        `
        SELECT id, product_id, variant_id
        FROM images
        WHERE variant_id = ?
      `,
        [`${variant.id}`]
      );
      variant.images = images.map((img: any) => ({
        id: img.id,
        product_id: img.product_id,
        variant_id: img.variant_id,
      }));
    }

    res.json({ ...product, variants });
  });

  // get image by image id
  app.get('/api/images/:id', async (req, res) => {
    const imageId = req.params.id;
    const db = getDB();

    const imageRecord = await getPromise.call(
      db,
      `
      SELECT id, image
      FROM images
      WHERE id = ?
  `,
      [imageId]
    );

    if (!imageRecord || !imageRecord.image) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    res.setHeader('Content-Type', 'image/jpeg');
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
      `
      SELECT price, timestamp
      FROM prices
      WHERE variant_id = ?
      ORDER BY timestamp ASC
      `,
      [variantId]
    );

    res.json(history);
  });

  app.get('/sale', async (req, res) => {
    const db = getDB();
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    const saleItems = await allPromise.call(
      db,
      `
      SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price, v.available_sizes, p.name, p.id as product_id, p.slug,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE v.last_seen_at = ? AND v.price < v.list_price
      ORDER BY ((v.list_price - v.price) / v.list_price) DESC
      `,
      [lastScanTime]
    );

    res.render('sale', {
      saleItems,
      title: 'On Sale',
    });
  });

  app.get('/', async (req, res) => {
    const db = getDB();
    const brandFilter = req.query.brand as string;
    const fitFilter = req.query.fit as string;

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    let sql = `
      SELECT v.id, v.color, v.color_id, v.length, v.added_at, v.price, v.list_price, p.name, p.brand, p.id as product_id, p.slug,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE v.last_seen_at = ?
    `;
    const params: any[] = [lastScanTime];

    if (brandFilter) {
      sql += ` AND p.brand = ?`;
      params.push(brandFilter);
    }

    if (fitFilter) {
      sql += ` AND p.fit LIKE ?`;
      params.push(`%${fitFilter}%`);
    }

    sql += ` ORDER BY v.added_at DESC LIMIT 50`;

    const variants = await allPromise.call(db, sql, params);

    // Fetch brands for filter
    const brands = await allPromise.call(
      db,
      `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`
    );

    // Fetch fits for filter
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
        // ignore parse errors
      }
    });
    const fits = Array.from(fitsSet).sort();

    // Format dates
    variants.forEach((v: any) => {
      v.added_at_formatted = dayjs.utc(v.added_at).fromNow();
      v.isVariant = true;
    });

    res.render('index', {
      activeProducts: variants,
      discontinuedProducts: [],
      title: 'Newest Variants',
      showAllLink: true,
      brands: brands.map((b: any) => b.brand),
      currentBrand: brandFilter,
      fits,
      currentFit: fitFilter,
    });
  });
  app.get('/products', async (req, res) => {
    const db = getDB();
    const brandFilter = req.query.brand as string;
    const fitFilter = req.query.fit as string;

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    let sql = `
      SELECT p.id, p.name, p.slug, p.brand,
             (SELECT id FROM images WHERE product_id = p.id LIMIT 1) as thumbnail_id,
             CASE WHEN MAX(v.last_seen_at) = ? THEN 0 ELSE 1 END as isDiscontinued
      FROM products p
      LEFT JOIN variants v ON p.id = v.product_id
      WHERE 1=1
    `;
    const params: any[] = [lastScanTime];

    if (brandFilter) {
      sql += ` AND p.brand = ?`;
      params.push(brandFilter);
    }

    if (fitFilter) {
      sql += ` AND p.fit LIKE ?`;
      params.push(`%${fitFilter}%`);
    }

    sql += ` GROUP BY p.id, p.name, p.slug ORDER BY p.name`;

    const allProducts = await allPromise.call(db, sql, params);

    // Fetch brands for filter
    const brands = await allPromise.call(
      db,
      `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`
    );

    // Fetch fits for filter
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
        // ignore parse errors
      }
    });
    const fits = Array.from(fitsSet).sort();

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
      fits,
      currentFit: fitFilter,
    });
  });

  app.get('/product/:id', async (req, res) => {
    const productId = req.params.id;
    const db = getDB();

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    const product = await getPromise.call(
      db,
      `
      SELECT id, name, slug, added_at, last_seen_at, fabric, warmth
      FROM products
      WHERE id = ?
  `,
      [productId]
    );

    if (!product) {
      res.status(404).send('Product not found');
      return;
    }

    const variants = await allPromise.call(
      db,
      `
      SELECT id, color, color_id, length, added_at, last_seen_at, price, list_price, available_sizes, all_sizes
      FROM variants
      WHERE product_id = ?
      ORDER BY color, length
  `,
      [productId]
    );

    const groupedVariants = new Map<string, any>();
    const allLengths = new Set<string>();

    for (const variant of variants) {
      if (!groupedVariants.has(variant.color)) {
        groupedVariants.set(variant.color, {
          color: variant.color,
          color_id: variant.color_id.split('_')[0], // Base color ID
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
        });
      }

      const group = groupedVariants.get(variant.color);
      if (!group.lengths.includes(variant.length)) {
        group.lengths.push(variant.length);
        allLengths.add(variant.length);
      }
      group.lastSeenAts.push(variant.last_seen_at);

      // Check for lowest price in history for this variant
      const history = await getPromise.call(
        db,
        `SELECT MIN(price) as min_price FROM prices WHERE variant_id = ?`,
        [variant.id]
      );
      if (history && history.min_price < group.lowest_price) {
        group.lowest_price = history.min_price;
      }

      if (!group.thumbnail) {
        const image = await getPromise.call(
          db,
          `SELECT id FROM images WHERE variant_id = ? LIMIT 1`,
          [variant.id]
        );
        if (image) {
          group.thumbnail = image.id;
        }
      }
    }

    // Determine if each color group is active
    for (const group of groupedVariants.values()) {
      group.isActive = group.lastSeenAts.some(
        (lastSeen: string) => lastSeen === lastScanTime
      );
      delete group.lastSeenAts; // Clean up
    }

    res.render('product', {
      product: {
        ...product,
        fabric: product.fabric ? JSON.parse(product.fabric) : [],
        warmth: product.warmth ? JSON.parse(product.warmth) : [],
        added_at_formatted: dayjs.utc(product.added_at).fromNow(),
        last_seen_at_formatted: dayjs.utc(product.last_seen_at).fromNow(),
        variants: Array.from(groupedVariants.values()),
        allLengths: Array.from(allLengths).sort(),
      },
    });
  });

  app.get('/product/:id/variant/:color_id', async (req, res) => {
    const { id: productId, color_id: colorId } = req.params;
    const db = getDB();

    const product = await getPromise.call(
      db,
      `SELECT id, name, slug, fabric, warmth FROM products WHERE id = ?`,
      [productId]
    );

    if (!product) {
      res.status(404).send('Product not found');
      return;
    }

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    // Fetch all variants that match this base color ID
    // We use LIKE because the color_id in DB might have suffixes like _1, _2
    const variants = await allPromise.call(
      db,
      `
      SELECT id, color, color_id, length, added_at, last_seen_at, price, list_price, available_sizes, all_sizes
      FROM variants
      WHERE product_id = ? AND (color_id = ? OR color_id LIKE ?)
      ORDER BY length
      `,
      [productId, colorId, `${colorId}_%`]
    );

    if (variants.length === 0) {
      res.status(404).send('Variant not found');
      return;
    }

    // Check if product has multiple lengths
    const distinctLengths = await allPromise.call(
      db,
      `SELECT DISTINCT length FROM variants WHERE product_id = ?`,
      [productId]
    );
    const hasMultipleLengths = distinctLengths.length > 1;

    const images = new Map<string, any>();

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

      const history = await getPromise.call(
        db,
        `SELECT MIN(price) as min_price FROM prices WHERE variant_id = ?`,
        [variant.id]
      );
      variant.lowest_price = history ? history.min_price : variant.price;

      const variantImages = await allPromise.call(
        db,
        `SELECT id FROM images WHERE variant_id = ?`,
        [variant.id]
      );

      variantImages.forEach((img: any) => {
        if (!images.has(img.id)) {
          images.set(img.id, img);
        }
      });
    }

    res.render('variant', {
      product: {
        ...product,
        fabric: product.fabric ? JSON.parse(product.fabric) : [],
        warmth: product.warmth ? JSON.parse(product.warmth) : [],
      },
      color: variants[0].color,
      color_id: colorId,
      variants,
      images: Array.from(images.values()),
      hasMultipleLengths,
    });
  });

  // New route to display discontinued items
  app.get('/colors', async (req, res) => {
    const db = getDB();

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    const colors = await allPromise.call(
      db,
      `
      SELECT DISTINCT v.color, v.color_id,
             MIN(v.added_at) as first_seen_at,
             COUNT(*) as variant_count,
             CASE WHEN MAX(v.last_seen_at) = ? THEN 1 ELSE 0 END as is_active
      FROM variants v
      GROUP BY v.color, v.color_id
      ORDER BY variant_count DESC, v.color
      `,
      [lastScanTime]
    );

    // For each color, fetch the "off_c" or "off_h" image if available
    for (const color of colors) {
      const thumbnail = await getPromise.call(
        db,
        `
        SELECT i.id as image_id, p.name as product_name
        FROM images i
        JOIN variants v ON i.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        WHERE v.color = ? AND (i.id LIKE '%off_c' OR i.id LIKE '%off_h')
        LIMIT 1
        `,
        [color.color]
      );
      color.thumbnail = thumbnail || null;
    }

    // Format dates
    colors.forEach((c: any) => {
      c.first_seen_at_formatted = dayjs.utc(c.first_seen_at).fromNow();
    });

    // Group colors
    const activeColors = colors.filter((c: any) => c.is_active);
    const inactiveColors = colors.filter((c: any) => !c.is_active);

    res.render('colors', { activeColors, inactiveColors, title: 'All Colors' });
  });

  app.get('/colors/:color', async (req, res) => {
    const color = decodeURIComponent(req.params.color);
    const db = getDB();

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    const allProducts = await allPromise.call(
      db,
      `
      SELECT DISTINCT p.id, p.name, p.slug,
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
      ORDER BY p.name
      `,
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
    });
  });

  app.get('/restocks', async (req, res) => {
    const db = getDB();

    const restocks = await allPromise.call(
      db,
      `
      SELECT r.timestamp, v.id, v.color, v.color_id, v.length, v.price, v.list_price, p.name, p.id as product_id, p.slug,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM restocks r
      JOIN variants v ON r.variant_id = v.id
      JOIN products p ON v.product_id = p.id
      ORDER BY r.timestamp DESC
      LIMIT 50
      `
    );

    restocks.forEach((r: any) => {
      r.added_at_formatted = dayjs.utc(r.timestamp).fromNow(); // Reuse added_at_formatted for display
      r.isVariant = true;
    });

    res.render('index', {
      activeProducts: restocks,
      discontinuedProducts: [],
      title: 'Recent Restocks',
      showAllLink: false,
    });
  });

  app.get('/discontinued', async (req, res) => {
    const db = getDB();

    // Get the latest scan time
    const lastScanRow = await getPromise.call(
      db,
      'SELECT MAX(last_seen_at) as max_time FROM variants'
    );
    const lastScanTime = lastScanRow
      ? lastScanRow.max_time
      : new Date().toISOString();

    const variants = await allPromise.call(
      db,
      `
      SELECT v.id, v.color, v.color_id, v.length, v.last_seen_at, p.name as product_name, p.id as product_id, p.slug,
             COALESCE(
               (SELECT id FROM images WHERE variant_id = v.id LIMIT 1),
               (SELECT i.id FROM images i JOIN variants v2 ON i.variant_id = v2.id WHERE v2.product_id = v.product_id AND v2.color = v.color LIMIT 1)
             ) as thumbnail_id
      FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE v.last_seen_at < ?
      ORDER BY v.last_seen_at DESC
      `,
      [lastScanTime]
    );

    // Format dates
    variants.forEach((v: any) => {
      v.last_seen_at_formatted = dayjs.utc(v.last_seen_at).fromNow();
    });

    res.render('discontinued', { variants, title: 'Discontinued Items' });
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
