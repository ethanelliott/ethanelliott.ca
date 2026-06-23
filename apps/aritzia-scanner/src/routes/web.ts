import { Router, Response } from 'express';
import { allPromise, getDB, getPromise } from '../db';
import {
  decodeEntities,
  fmtPrice,
  fromNow,
  getPageContext,
  parseJsonArr,
  sizeLikeParam,
  SIZES,
  Stats,
} from '../page-data';
import { getScanChanges } from '../scan-changes';

const router = Router();

const PER_PAGE = 48;

// Listing card shape consumed by views/partials/product_card.ejs and mirrored
// client-side by renderProductCard() in public/app.js.
type Card = {
  href: string;
  name: string;
  thumbnail_id?: string | null;
  price?: number | null;
  list_price?: number | null;
  pricePrefix?: string;
  subtext?: string | null;
  metaText?: string | null;
  favoriteId?: string | null;
  discontinued?: boolean;
  rating?: number | null;
  review_count?: number | null;
  sizes?: string[] | null;
};

type SortOption = { value: string; label: string };

const HOME_SORTS: Record<string, string> = {
  newest: 'v.added_at DESC',
  'price-low': 'v.price ASC',
  'price-high': 'v.price DESC',
  rating: 'p.rating DESC, p.review_count DESC',
  reviews: 'p.review_count DESC',
  discount:
    '(CASE WHEN v.list_price > 0 THEN (v.list_price - v.price) / v.list_price ELSE 0 END) DESC',
};

const HOME_SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: Low' },
  { value: 'price-high', label: 'Price: High' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'reviews', label: 'Most Reviews' },
  { value: 'discount', label: 'Biggest Discount' },
];

const PRODUCT_SORTS: Record<string, string> = {
  name: 'p.name ASC',
  reviews: 'p.review_count DESC',
  rating: 'p.rating DESC, p.review_count DESC',
  'price-low': 'min_price ASC',
  'price-high': 'min_price DESC',
};

const PRODUCT_SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: 'Name' },
  { value: 'reviews', label: 'Most Reviews' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'price-low', label: 'Price: Low' },
  { value: 'price-high', label: 'Price: High' },
];

function variantSubtext(v: any): string {
  if (!v.color) return '';
  return v.length && v.length !== 'REGULAR'
    ? `${v.color} (${v.length})`
    : v.color;
}

function variantCard(
  v: any,
  opts: { meta?: string | null; sizes?: string[] | null } = {}
): Card {
  return {
    href: `/product/${v.product_id}/variant/${v.color_id}`,
    name: v.display_name || v.name || v.product_name,
    thumbnail_id: v.thumbnail_id,
    price: v.price,
    list_price: v.list_price,
    subtext: variantSubtext(v),
    metaText: opts.meta ?? null,
    favoriteId: v.id ?? v.variant_id ?? null,
    discontinued: !!v.isDiscontinued,
    rating: v.rating,
    review_count: v.review_count,
    sizes: opts.sizes ?? null,
  };
}

function renderError(
  res: Response,
  stats: Stats,
  status: number,
  message: string
) {
  res.status(status).render('error', { title: `${status}`, status, message, stats });
}

async function getFilterOptions(db: any) {
  const brands = await allPromise.call(
    db,
    `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`
  );

  const fitsSet = new Set<string>();
  const fitRows = await allPromise.call(
    db,
    `SELECT fit FROM products WHERE fit IS NOT NULL`
  );
  fitRows.forEach((row: any) =>
    parseJsonArr(row.fit).forEach((f: string) => fitsSet.add(f))
  );

  const categorySet = new Set<string>();
  const categoryRows = await allPromise.call(
    db,
    `SELECT category FROM products WHERE category IS NOT NULL`
  );
  categoryRows.forEach((row: any) =>
    parseJsonArr(row.category).forEach((c: string) => categorySet.add(c))
  );

  return {
    brands: brands.map((b: any) => b.brand),
    fits: Array.from(fitsSet).sort(),
    categories: Array.from(categorySet).sort(),
  };
}

// ==================== LISTING PAGES ====================

// Homepage - Newest variants with search, filters, sorting
router.get('/', async (req, res) => {
  const db = getDB();
  const brandFilter = req.query.brand as string;
  const fitFilter = req.query.fit as string;
  const categoryFilter = req.query.category as string;
  const sizeFilter = req.query.size as string;
  const sortBy = HOME_SORTS[req.query.sort as string]
    ? (req.query.sort as string)
    : 'newest';
  const searchQuery = req.query.q as string;
  const minPrice = req.query.minPrice
    ? parseFloat(req.query.minPrice as string)
    : null;
  const maxPrice = req.query.maxPrice
    ? parseFloat(req.query.maxPrice as string)
    : null;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);

  const { lastScanTime, stats } = await getPageContext(db);

  let whereClauses = `WHERE v.last_seen_at >= ?`;
  const params: any[] = [lastScanTime];

  if (searchQuery) {
    whereClauses += ` AND (p.name LIKE ? OR p.display_name LIKE ? OR v.color LIKE ?)`;
    params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
  }

  if (brandFilter) {
    whereClauses += ` AND p.brand = ?`;
    params.push(brandFilter);
  }

  if (fitFilter) {
    whereClauses += ` AND p.fit LIKE ?`;
    params.push(`%${fitFilter}%`);
  }

  if (categoryFilter) {
    whereClauses += ` AND p.category LIKE ?`;
    params.push(`%${categoryFilter}%`);
  }

  if (sizeFilter) {
    whereClauses += ` AND v.available_sizes LIKE ?`;
    params.push(sizeLikeParam(sizeFilter));
  }

  if (minPrice !== null && !Number.isNaN(minPrice)) {
    whereClauses += ` AND v.price >= ?`;
    params.push(minPrice);
  }

  if (maxPrice !== null && !Number.isNaN(maxPrice)) {
    whereClauses += ` AND v.price <= ?`;
    params.push(maxPrice);
  }

  const countResult = await getPromise.call(
    db,
    `SELECT COUNT(*) as total FROM variants v JOIN products p ON v.product_id = p.id ${whereClauses}`,
    [...params]
  );
  const totalCount = countResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const variants = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.added_at, v.price, v.list_price,
            v.available_sizes, v.swatch, v.ref_color, v.thumbnail_id,
            p.name, p.display_name, p.brand, p.id as product_id, p.slug,
            p.rating, p.review_count
     FROM variants v
     JOIN products p ON v.product_id = p.id
     ${whereClauses}
     ORDER BY ${HOME_SORTS[sortBy]}
     LIMIT ? OFFSET ?`,
    [...params, PER_PAGE, (safePage - 1) * PER_PAGE]
  );

  const cards = variants.map((v: any) =>
    variantCard(v, { meta: `Added ${fromNow(v.added_at)}` })
  );

  const filterOptions = await getFilterOptions(db);

  res.render('index', {
    title: 'Newest Variants',
    cards,
    stats,
    baseUrl: '/',
    ...filterOptions,
    currentBrand: brandFilter,
    currentFit: fitFilter,
    currentCategory: categoryFilter,
    sizes: SIZES,
    currentSize: sizeFilter,
    sortOptions: HOME_SORT_OPTIONS,
    currentSort: sortBy,
    defaultSort: 'newest',
    searchQuery,
    showPriceFilters: true,
    minPrice,
    maxPrice,
    page: safePage,
    totalPages,
    totalCount,
    emptyMessage: 'No variants match these filters.',
  });
});

// All products page
router.get('/products', async (req, res) => {
  const db = getDB();
  const brandFilter = req.query.brand as string;
  const fitFilter = req.query.fit as string;
  const categoryFilter = req.query.category as string;
  const sortBy = PRODUCT_SORTS[req.query.sort as string]
    ? (req.query.sort as string)
    : 'name';
  const searchQuery = req.query.q as string;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);

  const { lastScanTime, stats } = await getPageContext(db);

  let whereClauses = `WHERE 1=1`;
  const params: any[] = [];

  if (searchQuery) {
    whereClauses += ` AND (p.name LIKE ? OR p.display_name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
  }

  if (brandFilter) {
    whereClauses += ` AND p.brand = ?`;
    params.push(brandFilter);
  }

  if (fitFilter) {
    whereClauses += ` AND p.fit LIKE ?`;
    params.push(`%${fitFilter}%`);
  }

  if (categoryFilter) {
    whereClauses += ` AND p.category LIKE ?`;
    params.push(`%${categoryFilter}%`);
  }

  const countResult = await getPromise.call(
    db,
    `SELECT COUNT(*) as total FROM products p ${whereClauses}`,
    [...params]
  );
  const totalCount = countResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const products = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.brand, p.rating, p.review_count,
            (SELECT thumbnail_id FROM variants WHERE product_id = p.id AND thumbnail_id IS NOT NULL LIMIT 1) as thumbnail_id,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 0 ELSE 1 END as isDiscontinued,
            COALESCE(MIN(CASE WHEN v.last_seen_at >= ? THEN v.price END), MIN(v.price)) as min_price
     FROM products p
     LEFT JOIN variants v ON p.id = v.product_id
     ${whereClauses}
     GROUP BY p.id
     ORDER BY isDiscontinued ASC, ${PRODUCT_SORTS[sortBy]}
     LIMIT ? OFFSET ?`,
    [lastScanTime, lastScanTime, ...params, PER_PAGE, (safePage - 1) * PER_PAGE]
  );

  const cards: Card[] = products.map((p: any) => ({
    href: `/product/${p.id}`,
    name: p.display_name || p.name,
    thumbnail_id: p.thumbnail_id,
    price: p.min_price,
    pricePrefix: 'From ',
    rating: p.rating,
    review_count: p.review_count,
    discontinued: !!p.isDiscontinued,
  }));

  const filterOptions = await getFilterOptions(db);

  res.render('index', {
    title: 'All Products',
    cards,
    stats,
    baseUrl: '/products',
    ...filterOptions,
    currentBrand: brandFilter,
    currentFit: fitFilter,
    currentCategory: categoryFilter,
    sizes: [],
    currentSize: null,
    sortOptions: PRODUCT_SORT_OPTIONS,
    currentSort: sortBy,
    defaultSort: 'name',
    searchQuery,
    showPriceFilters: false,
    minPrice: null,
    maxPrice: null,
    page: safePage,
    totalPages,
    totalCount,
    emptyMessage: 'No products match these filters.',
  });
});

// Sale page
router.get('/sale', async (req, res) => {
  const db = getDB();
  const sizeFilter = req.query.size as string;
  const sortBy = ['discount', 'price-low', 'price-high'].includes(
    req.query.sort as string
  )
    ? (req.query.sort as string)
    : 'discount';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const { lastScanTime, stats } = await getPageContext(db);

  let whereClauses = `WHERE v.last_seen_at >= ? AND v.price < v.list_price AND v.list_price > 0`;
  const params: any[] = [lastScanTime];

  if (sizeFilter) {
    whereClauses += ` AND v.available_sizes LIKE ?`;
    params.push(sizeLikeParam(sizeFilter));
  }

  const orderBy =
    sortBy === 'price-low'
      ? 'v.price ASC'
      : sortBy === 'price-high'
      ? 'v.price DESC'
      : '((v.list_price - v.price) / v.list_price) DESC';

  const countResult = await getPromise.call(
    db,
    `SELECT COUNT(*) as total FROM variants v JOIN products p ON v.product_id = p.id ${whereClauses}`,
    [...params]
  );
  const totalCount = countResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const saleItems = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price, v.available_sizes,
            v.swatch, v.ref_color, v.thumbnail_id,
            p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count
     FROM variants v
     JOIN products p ON v.product_id = p.id
     ${whereClauses}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, PER_PAGE, (safePage - 1) * PER_PAGE]
  );

  const cards = saleItems.map((item: any) =>
    variantCard(item, { sizes: parseJsonArr(item.available_sizes) })
  );

  res.render('sale', {
    title: 'On Sale',
    cards,
    sizes: SIZES,
    currentSize: sizeFilter,
    currentSort: sortBy,
    stats,
    page: safePage,
    totalPages,
    totalCount,
  });
});

// Restocks page
router.get('/restocks', async (req, res) => {
  const db = getDB();
  const { stats } = await getPageContext(db);

  const restocks = await allPromise.call(
    db,
    `SELECT r.timestamp, v.id, v.color, v.color_id, v.length, v.price, v.list_price,
            v.available_sizes, v.swatch, v.thumbnail_id,
            p.name, p.display_name, p.id as product_id, p.slug, p.rating, p.review_count
     FROM restocks r
     JOIN variants v ON r.variant_id = v.id
     JOIN products p ON v.product_id = p.id
     ORDER BY r.timestamp DESC
     LIMIT 50`
  );

  const cards = restocks.map((r: any) =>
    variantCard(r, {
      meta: `Restocked ${fromNow(r.timestamp)}`,
      sizes: parseJsonArr(r.available_sizes),
    })
  );

  res.render('restocks', {
    title: 'Recent Restocks',
    cards,
    stats,
  });
});

// Discontinued page
router.get('/discontinued', async (req, res) => {
  const db = getDB();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const { lastScanTime, stats } = await getPageContext(db);

  const countResult = await getPromise.call(
    db,
    `SELECT COUNT(*) as total FROM variants v WHERE v.last_seen_at < ?`,
    [lastScanTime]
  );
  const totalCount = countResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const variants = await allPromise.call(
    db,
    `SELECT v.id, v.color, v.color_id, v.length, v.last_seen_at, v.price, v.list_price,
            v.swatch, v.thumbnail_id,
            p.name, p.display_name, p.id as product_id, p.slug,
            p.rating, p.review_count
     FROM variants v
     JOIN products p ON v.product_id = p.id
     WHERE v.last_seen_at < ?
     ORDER BY v.last_seen_at DESC
     LIMIT ? OFFSET ?`,
    [lastScanTime, PER_PAGE, (safePage - 1) * PER_PAGE]
  );

  const cards = variants.map((v: any) =>
    variantCard(v, { meta: `Last seen ${fromNow(v.last_seen_at)}` })
  );

  res.render('discontinued', {
    title: 'Discontinued Items',
    cards,
    stats,
    page: safePage,
    totalPages,
    totalCount,
  });
});

// What's New — everything that changed in the most recent completed scan.
// Objective and shared across visitors (contrast with /new-to-me, which is
// per-device). Resets each scan.
router.get('/whats-new', async (req, res) => {
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  if (!lastScanTime) {
    res.render('whats_new', {
      title: "What's New",
      lastScanFormatted: stats.lastScanFormatted,
      newProductCards: [],
      newColorCards: [],
      restockCards: [],
      priceDropCards: [],
      stats,
    });
    return;
  }

  const { newProducts, newColors, restocks, priceDrops } = await getScanChanges(
    db,
    lastScanTime
  );

  const newProductCards: Card[] = newProducts.map((p: any) => ({
    href: `/product/${p.id}`,
    name: p.display_name || p.name,
    thumbnail_id: p.thumbnail_id,
    price: p.price,
    pricePrefix: 'From ',
    rating: p.rating,
    review_count: p.review_count,
    discontinued: !!p.isDiscontinued,
  }));

  const newColorCards: Card[] = newColors.map((v: any) => ({
    href: `/product/${v.product_id}/variant/${v.color_id}`,
    name: v.display_name || v.name,
    thumbnail_id: v.thumbnail_id,
    price: v.price,
    list_price: v.list_price,
    subtext: v.color,
    rating: v.rating,
    review_count: v.review_count,
  }));

  const restockCards = restocks.map((r: any) =>
    variantCard(r, { sizes: parseJsonArr(r.available_sizes) })
  );

  const priceDropCards = priceDrops.map((d: any) =>
    variantCard(d, {
      meta: `Was ${fmtPrice(d.old_price)}`,
      sizes: parseJsonArr(d.available_sizes),
    })
  );

  res.render('whats_new', {
    title: "What's New",
    lastScanFormatted: stats.lastScanFormatted,
    newProductCards,
    newColorCards,
    restockCards,
    priceDropCards,
    stats,
  });
});

// New to Me — products added since the last scan this browser acknowledged.
// The high-water mark lives in localStorage (like favorites), so the page is
// rendered as a shell that public/app.js fills in via /api/new-products.
router.get('/new-to-me', async (req, res) => {
  const { stats } = await getPageContext(getDB());
  res.render('new_to_me', { title: 'New to Me', stats });
});

// ==================== PRODUCT & VARIANT DETAIL ====================

router.get('/product/:id', async (req, res) => {
  const productId = req.params.id;
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  const product = await getPromise.call(
    db,
    `SELECT * FROM products WHERE id = ?`,
    [productId]
  );

  if (!product) {
    renderError(res, stats, 404, 'Product not found.');
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
        color_id: variant.color_id,
        lengths: [],
        added_at: variant.added_at,
        last_seen_at: variant.last_seen_at,
        lastSeenAts: [],
        thumbnail: null,
        price: variant.price,
        list_price: variant.list_price,
        lowest_price: variant.price,
        available_sizes: parseJsonArr(variant.available_sizes),
        all_sizes: parseJsonArr(variant.all_sizes),
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
    if (!group.thumbnail && variant.thumbnail_id) {
      group.thumbnail = variant.thumbnail_id;
    }
  }

  // Batch: get lowest prices for all variants at once
  const variantIds = variants.map((v: any) => v.id);
  const lowestPrices =
    variantIds.length > 0
      ? await allPromise.call(
          db,
          `SELECT variant_id, MIN(price) as min_price FROM prices WHERE variant_id IN (${variantIds
            .map(() => '?')
            .join(',')}) GROUP BY variant_id`,
          variantIds
        )
      : [];
  const lowestPriceMap = new Map<string, number>();
  lowestPrices.forEach((r: any) =>
    lowestPriceMap.set(r.variant_id, r.min_price)
  );

  for (const variant of variants) {
    const group = groupedVariants.get(variant.color);
    const minPrice = lowestPriceMap.get(variant.id);
    if (minPrice !== undefined && minPrice < group.lowest_price) {
      group.lowest_price = minPrice;
    }
  }

  for (const group of groupedVariants.values()) {
    group.isActive =
      lastScanTime !== null &&
      group.lastSeenAts.some((lastSeen: string) => lastSeen >= lastScanTime);
    delete group.lastSeenAts;
  }

  res.render('product', {
    title: product.display_name || product.name,
    product: {
      ...product,
      description: decodeEntities(product.description),
      designers_notes: decodeEntities(product.designers_notes),
      fabric: parseJsonArr(product.fabric),
      warmth: parseJsonArr(product.warmth),
      category: parseJsonArr(product.category),
      sustainability: parseJsonArr(product.sustainability),
      neckline: parseJsonArr(product.neckline),
      sleeve: parseJsonArr(product.sleeve),
      style: parseJsonArr(product.style),
      added_at_formatted: fromNow(product.added_at),
      last_seen_at_formatted: fromNow(product.last_seen_at),
      variants: Array.from(groupedVariants.values()),
      allLengths: Array.from(allLengths).sort(),
    },
    stats,
  });
});

router.get('/product/:id/variant/:color_id', async (req, res) => {
  const { id: productId, color_id: colorId } = req.params;
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  const product = await getPromise.call(
    db,
    `SELECT * FROM products WHERE id = ?`,
    [productId]
  );

  if (!product) {
    renderError(res, stats, 404, 'Product not found.');
    return;
  }

  const variants = await allPromise.call(
    db,
    `SELECT * FROM variants WHERE product_id = ? AND (color_id = ? OR color_id LIKE ?) ORDER BY length`,
    [productId, colorId, `${colorId}_%`]
  );

  if (variants.length === 0) {
    renderError(res, stats, 404, 'Variant not found.');
    return;
  }

  const distinctLengths = await allPromise.call(
    db,
    `SELECT DISTINCT length FROM variants WHERE product_id = ?`,
    [productId]
  );
  const hasMultipleLengths = distinctLengths.length > 1;

  const variantIds = variants.map((v: any) => v.id);

  // Batch: get lowest prices for all variant IDs
  const lowestPrices =
    variantIds.length > 0
      ? await allPromise.call(
          db,
          `SELECT variant_id, MIN(price) as min_price FROM prices WHERE variant_id IN (${variantIds
            .map(() => '?')
            .join(',')}) GROUP BY variant_id`,
          variantIds
        )
      : [];
  const lowestPriceMap = new Map<string, number>();
  lowestPrices.forEach((r: any) =>
    lowestPriceMap.set(r.variant_id, r.min_price)
  );

  // Batch: get all images for all variants
  const images = new Map<string, any>();
  const batchImages =
    variantIds.length > 0
      ? await allPromise.call(
          db,
          `SELECT id, variant_id FROM images WHERE variant_id IN (${variantIds
            .map(() => '?')
            .join(',')})`,
          variantIds
        )
      : [];
  batchImages.forEach((img: any) => {
    if (!images.has(img.id)) {
      images.set(img.id, img);
    }
  });

  for (const variant of variants) {
    variant.added_at_formatted = fromNow(variant.added_at);
    variant.last_seen_at_formatted = fromNow(variant.last_seen_at);
    variant.isActive =
      lastScanTime !== null && variant.last_seen_at >= lastScanTime;
    variant.available_sizes = parseJsonArr(variant.available_sizes);
    variant.all_sizes = parseJsonArr(variant.all_sizes);

    const minPrice = lowestPriceMap.get(variant.id);
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
    sa.sizes = parseJsonArr(sa.available_sizes);
  });

  res.render('variant', {
    title: `${variants[0].color} - ${product.display_name || product.name}`,
    product: {
      ...product,
      fabric: parseJsonArr(product.fabric),
      warmth: parseJsonArr(product.warmth),
      category: parseJsonArr(product.category),
      sustainability: parseJsonArr(product.sustainability),
      neckline: parseJsonArr(product.neckline),
      sleeve: parseJsonArr(product.sleeve),
      style: parseJsonArr(product.style),
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

// ==================== COLORS ====================

router.get('/colors', async (req, res) => {
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  const colors = await allPromise.call(
    db,
    `SELECT v.color,
            MIN(v.added_at) as first_seen_at,
            COUNT(*) as variant_count,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 1 ELSE 0 END as is_active
     FROM variants v
     GROUP BY v.color
     ORDER BY variant_count DESC, v.color`,
    [lastScanTime]
  );

  // One batched thumbnail query instead of one query per color
  const thumbnails = await allPromise.call(
    db,
    `SELECT v.color, MIN(i.id) as image_id
     FROM images i
     JOIN variants v ON i.variant_id = v.id
     WHERE (i.id LIKE '%off_c' OR i.id LIKE '%off_h')
     GROUP BY v.color`
  );
  const thumbnailMap = new Map<string, string>();
  thumbnails.forEach((t: any) => thumbnailMap.set(t.color, t.image_id));

  colors.forEach((c: any) => {
    c.thumbnail_id = thumbnailMap.get(c.color) || null;
    c.first_seen_at_formatted = fromNow(c.first_seen_at);
  });

  res.render('colors', {
    title: 'All Colors',
    activeColors: colors.filter((c: any) => c.is_active),
    inactiveColors: colors.filter((c: any) => !c.is_active),
    stats,
  });
});

router.get('/colors/:color', async (req, res) => {
  const color = decodeURIComponent(req.params.color);
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  const products = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.rating, p.review_count,
            (SELECT v2.thumbnail_id FROM variants v2
             WHERE v2.product_id = p.id AND v2.color = ? AND v2.thumbnail_id IS NOT NULL
             LIMIT 1) as thumbnail_id,
            (SELECT v2.color_id FROM variants v2
             WHERE v2.product_id = p.id AND v2.color = ?
             LIMIT 1) as variant_color_id,
            (SELECT COALESCE(
               MIN(CASE WHEN v2.last_seen_at >= ? THEN v2.price END),
               MIN(v2.price)
             ) FROM variants v2
             WHERE v2.product_id = p.id AND v2.color = ?) as price,
            CASE WHEN MAX(v3.last_seen_at) >= ? THEN 0 ELSE 1 END as isDiscontinued
     FROM products p
     JOIN variants v ON p.id = v.product_id
     LEFT JOIN variants v3 ON p.id = v3.product_id
     WHERE v.color = ?
     GROUP BY p.id
     ORDER BY isDiscontinued ASC, p.review_count DESC, p.name`,
    [color, color, lastScanTime, color, lastScanTime, color]
  );

  const cards: Card[] = products.map((p: any) => ({
    href: `/product/${p.id}/variant/${p.variant_color_id}`,
    name: p.display_name || p.name,
    thumbnail_id: p.thumbnail_id,
    price: p.price,
    rating: p.rating,
    review_count: p.review_count,
    discontinued: !!p.isDiscontinued,
  }));

  res.render('color_products', {
    title: `Products in ${color}`,
    color,
    cards,
    stats,
  });
});

// ==================== CATEGORIES ====================

router.get('/categories', async (req, res) => {
  const db = getDB();
  const { lastScanTime, stats } = await getPageContext(db);

  const allCategoryRows = await allPromise.call(
    db,
    `SELECT p.id, p.category,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 1 ELSE 0 END as is_active
     FROM products p
     LEFT JOIN variants v ON p.id = v.product_id
     WHERE p.category IS NOT NULL
     GROUP BY p.id`,
    [lastScanTime]
  );

  const categoryMap = new Map<string, { count: number; activeCount: number }>();
  allCategoryRows.forEach((row: any) => {
    parseJsonArr(row.category).forEach((c: string) => {
      if (!categoryMap.has(c)) {
        categoryMap.set(c, { count: 0, activeCount: 0 });
      }
      const entry = categoryMap.get(c)!;
      entry.count++;
      if (row.is_active) entry.activeCount++;
    });
  });

  const categories = Array.from(categoryMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.activeCount - a.activeCount);

  res.render('categories', {
    title: 'Categories',
    categories,
    stats,
  });
});

router.get('/categories/:category', async (req, res) => {
  const category = decodeURIComponent(req.params.category);
  const db = getDB();
  const sortBy = ['reviews', 'rating', 'price-low', 'price-high'].includes(
    req.query.sort as string
  )
    ? (req.query.sort as string)
    : 'reviews';
  const { lastScanTime, stats } = await getPageContext(db);

  const orderBy =
    sortBy === 'price-low'
      ? 'price ASC'
      : sortBy === 'price-high'
      ? 'price DESC'
      : sortBy === 'rating'
      ? 'p.rating DESC'
      : 'p.review_count DESC';

  const products = await allPromise.call(
    db,
    `SELECT p.id, p.name, p.display_name, p.slug, p.brand, p.rating, p.review_count,
            (SELECT thumbnail_id FROM variants WHERE product_id = p.id AND thumbnail_id IS NOT NULL LIMIT 1) as thumbnail_id,
            CASE WHEN MAX(v.last_seen_at) >= ? THEN 0 ELSE 1 END as isDiscontinued,
            COALESCE(MIN(CASE WHEN v.last_seen_at >= ? THEN v.price END), MIN(v.price)) as price
     FROM products p
     LEFT JOIN variants v ON p.id = v.product_id
     WHERE p.category LIKE ?
     GROUP BY p.id
     ORDER BY isDiscontinued ASC, ${orderBy}`,
    [lastScanTime, lastScanTime, `%${category}%`]
  );

  const cards: Card[] = products.map((p: any) => ({
    href: `/product/${p.id}`,
    name: p.display_name || p.name,
    thumbnail_id: p.thumbnail_id,
    price: p.price,
    pricePrefix: 'From ',
    rating: p.rating,
    review_count: p.review_count,
    discontinued: !!p.isDiscontinued,
  }));

  res.render('category_products', {
    title: category,
    category,
    cards,
    currentSort: sortBy,
    stats,
  });
});

// ==================== STORES ====================

const COUNTRY_LABELS: Record<string, string> = {
  CA: 'Canada',
  US: 'United States',
};

router.get('/stores', async (req, res) => {
  const db = getDB();
  const { stats } = await getPageContext(db);

  const stores = await allPromise.call(
    db,
    `SELECT s.id, s.name, s.city, s.province, s.country,
            COUNT(DISTINCT sa.variant_id) as variant_count
     FROM stores s
     LEFT JOIN store_availability sa ON s.id = sa.store_id
     GROUP BY s.id
     ORDER BY s.country DESC, s.province, s.city`
  );

  // Group dynamically so stores outside CA/US still show up
  const groupMap = new Map<string, any[]>();
  stores.forEach((store: any) => {
    const key = store.country || 'Other';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(store);
  });
  const order = ['CA', 'US'];
  const storeGroups = Array.from(groupMap.entries())
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      return a.localeCompare(b);
    })
    .map(([country, groupStores]) => ({
      label: COUNTRY_LABELS[country] || country,
      stores: groupStores,
    }));

  res.render('stores', {
    title: 'Store Locations',
    storeGroups,
    totalStores: stores.length,
    stats,
  });
});

router.get('/stores/:storeId', async (req, res) => {
  const db = getDB();
  const { stats } = await getPageContext(db);
  const storeId = req.params.storeId;
  const sizeFilter = (req.query.size as string) || '';
  const sort = ['name', 'price-low', 'price-high'].includes(
    req.query.sort as string
  )
    ? (req.query.sort as string)
    : 'name';

  const store = await getPromise.call(db, `SELECT * FROM stores WHERE id = ?`, [
    storeId,
  ]);

  if (!store) {
    renderError(res, stats, 404, 'Store not found.');
    return;
  }

  // Get all sizes available at this store for the filter dropdown
  const sizesRaw = await allPromise.call(
    db,
    `SELECT DISTINCT available_sizes FROM store_availability WHERE store_id = ?`,
    [storeId]
  );
  const sizesSet = new Set<string>();
  sizesRaw.forEach((row: any) => {
    if (!row.available_sizes) return;
    const parsed = parseJsonArr(row.available_sizes);
    const values = parsed.length
      ? parsed
      : String(row.available_sizes).split('|');
    values.forEach((s: string) => {
      if (s && s.trim()) sizesSet.add(s.trim());
    });
  });
  const sizes = Array.from(sizesSet).sort((a, b) => {
    const aIdx = SIZES.indexOf(a);
    const bIdx = SIZES.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  let query = `
    SELECT DISTINCT
      sa.variant_id,
      sa.color_id,
      sa.available_sizes as store_sizes,
      v.price,
      v.list_price,
      v.color,
      v.thumbnail_id,
      p.id as product_id,
      p.name,
      p.display_name,
      p.slug,
      p.rating,
      p.review_count
    FROM store_availability sa
    JOIN variants v ON v.id = sa.variant_id AND v.color_id = sa.color_id
    JOIN products p ON p.id = v.product_id
    WHERE sa.store_id = ?
  `;
  const params: any[] = [storeId];

  if (sizeFilter) {
    query += ` AND sa.available_sizes LIKE ?`;
    params.push(sizeLikeParam(sizeFilter));
  }

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

  const cards = items.map((item: any) => {
    const parsed = parseJsonArr(item.store_sizes);
    const storeSizes = parsed.length
      ? parsed
      : item.store_sizes
      ? String(item.store_sizes).split('|')
      : [];
    return variantCard(item, { sizes: storeSizes });
  });

  res.render('store_detail', {
    title: store.name !== 'Unknown' ? store.name : `Store #${storeId}`,
    store,
    cards,
    sizes,
    currentSize: sizeFilter,
    currentSort: sort,
    stats,
  });
});

// ==================== FAVORITES & AI PAGES ====================

router.get('/favorites', async (req, res) => {
  const { stats } = await getPageContext(getDB());
  res.render('favorites', { title: 'My Favorites', stats });
});

router.get('/ai/search', async (req, res) => {
  const { stats } = await getPageContext(getDB());
  res.render('ai_search', { title: 'AI Search', stats });
});

router.get('/ai/style', async (req, res) => {
  const { stats } = await getPageContext(getDB());
  res.render('ai_style', { title: 'Style Advisor', stats });
});

router.get('/ai/deals', async (req, res) => {
  const { stats } = await getPageContext(getDB());
  res.render('ai_deals', { title: 'Deals Report', stats });
});

export default router;
