import puppeteer, { Browser, Page, HTTPResponse } from 'puppeteer';
import sqlite3 from 'sqlite3';
import {
  APIResponse,
  ImageDownloadRecord,
  IntermediateForm,
  Item,
} from './types';
import {
  allPromise,
  getCountPromise,
  getDB,
  prepareRunAll,
  runPromise,
} from './db';
import { createProgressBar } from './utils';
import storeData from './stores.json';

const ALGOLIA_APP_ID = 'SONLJM8OH6';
const ALGOLIA_API_KEY = '1455bca7c6c33e746a0f38beb28422e6';
const INDEX_NAME = 'production_ecommerce_aritzia__Aritzia_CA__products__en_CA';
const MAX_HITS_PER_PAGE = 1000;
const MAX_CONCURRENT_DOWNLOADS = parseInt(
  process.env.MAX_CONCURRENT_DOWNLOADS || '5',
  10
); // Parallel execution limit
const DEBUG_LOGGING = process.env.DEBUG_LOGGING === 'true';

const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${INDEX_NAME}/query`;

const BASE_IMAGE_URL =
  'https://assets.aritzia.com/image/upload/c_crop,ar_1920:2623,g_south/q_auto,f_auto,dpr_auto/';

let BROWSER: Browser | null = null;

async function getBrowser() {
  if (!BROWSER) {
    BROWSER = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    });
  }
  return BROWSER;
}

export async function closeBrowser() {
  if (BROWSER) {
    await BROWSER.close();
    BROWSER = null;
  }
}

async function downloadImageWithPuppeteer(
  db: sqlite3.Database,
  record: ImageDownloadRecord,
  advance: () => void
) {
  const imageUrl = `${BASE_IMAGE_URL}${record.id}`;
  if (DEBUG_LOGGING) console.log(`Starting download for ${record.id}`);
  const browser = await getBrowser();
  let page: Page | undefined;
  try {
    page = await browser.newPage();

    // Set a common user agent to help mimic a regular browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    let imageBuffer: Buffer | null = null;

    // Use a promise to wait for the image buffer capture inside the response handler
    const bufferCapturePromise = new Promise<Buffer>((resolve, reject) => {
      page!.on('response', async (response: HTTPResponse) => {
        // Check if the response URL matches our target and if the status is successful (200-299)
        if (response.url() === imageUrl && response.ok()) {
          const contentType = response.headers()['content-type'] || '';

          if (contentType.startsWith('image/')) {
            try {
              // The key step: response.buffer() returns the binary data
              const buffer = await response.buffer();
              resolve(buffer); // Resolve the promise with the Buffer
            } catch (error: any) {
              reject(
                new Error(`Error reading response buffer: ${error.message}`)
              );
            }
          }
        }
      });

      // Set a fallback timer in case the image request never happens or the page stalls
      setTimeout(() => {
        // Only reject if we haven't already resolved the buffer
        reject(
          new Error(
            'Image download timed out or target URL not requested by the page.'
          )
        );
      }, 30000); // 30 seconds timeout
    });

    await page.goto(imageUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Wait for the buffer capture promise to resolve
    imageBuffer = await bufferCapturePromise;

    // Update the image table with the BLOB data
    // Parameters: [image BLOB, product_id, color_id, file]
    const updateSql = `
      UPDATE images 
      SET image = ? 
      WHERE id = ?
    `;

    // Use runPromise (from db prototype) for the update
    await runPromise.call(db, updateSql, [imageBuffer, record.id]);

    if (DEBUG_LOGGING) console.log(`Finished download for ${record.id}`);
    advance();
  } catch (error: any) {
    // We log errors but don't stop the whole process, so other workers continue
    console.error(`\n❌ Failed to download ${record.id}:`, error.message);
  }
  await page?.close();
}

async function fetchApiData() {
  console.log('Fetching data from Algolia API...');
  // NOTE: This Algolia API call is working fine, which is why we are keeping the core logic.
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'fleece',
      hitsPerPage: MAX_HITS_PER_PAGE,
      facets: ['*'],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `API responded with ${response.status}: ${response.statusText}`
    );
  }

  const data = (await response.json()) as APIResponse;
  console.log(`Successfully fetched ${data.hits.length} hits.`);

  return data.hits;
}

// Helper to parse store availability string like "18111|1275:XS" or "10230|4425:2XS|L|M|S|XL|XS"
function parseStoreAvailability(
  storeAvailability: Array<{ id: string; a: Array<string> }>
): Array<{
  storeId: string;
  availability: Array<{ colorId: string; sizes: Array<string> }>;
}> {
  return storeAvailability.map((store) => ({
    storeId: store.id,
    availability: store.a.flatMap((entry) => {
      // Format: "colorId1|colorId2:size1|size2" or just "colorId1|colorId2:size1"
      const [colorPart, sizePart] = entry.split(':');
      if (!colorPart || !sizePart) return [];

      const colorIds = colorPart.split('|');
      const sizes = sizePart.split('|');

      return colorIds.map((colorId) => ({
        colorId,
        sizes,
      }));
    }),
  }));
}

function groupByMasterId(data: Array<Item>) {
  const groupedData = new Map<string, Array<IntermediateForm>>();

  data.forEach((item) => {
    if (!groupedData.has(item.masterId)) {
      groupedData.set(item.masterId, []);
    }
    if (item.objectID.includes('duplicate')) {
      return; // Skip duplicate entries
    }
    // Only one product entry is needed per unique objectID, so we only store the first one found
    if (groupedData.get(item.masterId)?.some((p) => p.id === item.objectID)) {
      return;
    }

    groupedData.get(item.masterId)?.push({
      id: item.masterId,
      name: item.name || item.c_displayName,
      displayName: item.c_displayName || item.name,
      brand: item.brand,
      warmth: item.warmth || [],
      fit: item.articleFit || [],
      description: item.seoProductDesc || '',
      designersNotes: item.designersNotes || '',
      price: item.price,
      onSale: item.onSale,
      orderable: item.orderable,
      // New fields
      rating: item.rating || 0,
      reviewCount: item.reviewCount || 0,
      category: item.subDept || [],
      refinementColor: item.refinementColor || '',
      sustainability: item.sustainability || [],
      defaultImage: item.defaultImage || '',
      storeAvailability: parseStoreAvailability(item.storeAvailability || []),
      about: {
        rise: item.rise || [],
        legShape: item.legShape || [],
        articleFit: item.articleFit || [],
        inseam: item.inseam || [],
        length: item.length || [],
        fabric: item.fabric || [],
        style: item.style || [],
        neckline: item.neckline || [],
        sleeve: item.sleeve || [],
      },
      slug: item.slug,
      colors: item.selectableColors.map((c) => {
        const listPriceEntry = c.prices.find(
          (p) => p.source === 'cad-list-prices'
        );
        const salePriceEntry = c.prices.find(
          (p) => p.source === 'cad-sale-prices'
        );

        const listPrice = listPriceEntry?.prices[0] || 0;
        const salePrice = salePriceEntry?.prices[0];
        const currentPrice = salePrice !== undefined ? salePrice : listPrice;

        return {
          name: c.value,
          onSale: c.onSale,
          sizeRun: c.sizeRun,
          colorIds: Object.keys(c.colorIds),
          images: [...new Set(Object.values(c.colorIds).flat())],
          swatch: c.swatch || '',
          refColor: c.refColor || '',
          price: currentPrice,
          list_price: listPrice,
          available_sizes: c.shippableSizes || [],
          all_sizes: c.sizeRun || [],
        };
      }),
    });
  });

  return groupedData;
}

export async function updateDatabase() {
  const DB = getDB();
  const scrapeTime = new Date().toISOString();
  console.log(`Current Scrape Timestamp: ${scrapeTime}`);

  const data = await fetchApiData();
  const groupedData = groupByMasterId(data);

  console.log('Preparing records for insertion...');
  // Bulk insert records
  const productInsertRecords: any[][] = [];
  const variantInsertRecords: any[][] = [];
  const imageInsertRecords: any[][] = [];
  const priceInsertRecords: any[][] = [];
  const storeAvailabilityRecords: any[][] = [];

  // Records for update (separate as they are only used for the last_seen_at update step)
  const productUpdateRecords: any[][] = [];
  const variantUpdateRecords: any[][] = [];
  const restockInsertRecords: any[][] = [];

  // Fetch existing variants to check for restocks and price changes
  const existingVariants = await allPromise.call(
    DB,
    'SELECT id, available_sizes, price, list_price FROM variants'
  );
  const existingVariantsMap = new Map<
    string,
    { sizes: string[]; price: number; listPrice: number }
  >();
  existingVariants.forEach((v: any) => {
    existingVariantsMap.set(v.id, {
      sizes: JSON.parse(v.available_sizes || '[]'),
      price: v.price,
      listPrice: v.list_price,
    });
  });

  for (const [masterId, items] of groupedData.entries()) {
    for (const product of items) {
      // 1. Prepare product insert record with all new fields
      productInsertRecords.push([
        masterId,
        product.name,
        product.displayName,
        product.slug,
        product.description,
        product.designersNotes,
        JSON.stringify(product.about.fabric || []),
        product.brand,
        JSON.stringify(product.warmth || []),
        JSON.stringify(product.fit || []),
        JSON.stringify(product.category || []),
        product.rating || 0,
        product.reviewCount || 0,
        JSON.stringify(product.sustainability || []),
        JSON.stringify(product.about.neckline || []),
        JSON.stringify(product.about.sleeve || []),
        JSON.stringify(product.about.style || []),
        product.defaultImage || '',
        scrapeTime, // last_seen_at for new inserts
      ]);
      productUpdateRecords.push([
        scrapeTime,
        product.displayName,
        product.description,
        product.designersNotes,
        JSON.stringify(product.about.fabric || []),
        product.brand,
        JSON.stringify(product.warmth || []),
        JSON.stringify(product.fit || []),
        JSON.stringify(product.category || []),
        product.rating || 0,
        product.reviewCount || 0,
        JSON.stringify(product.sustainability || []),
        JSON.stringify(product.about.neckline || []),
        JSON.stringify(product.about.sleeve || []),
        JSON.stringify(product.about.style || []),
        product.defaultImage || '',
        product.id,
      ]); // parameters for UPDATE

      for (const color of product.colors) {
        for (const colorId of color.colorIds) {
          // Normalize colorId by removing length suffix (_1, _2) before checking length logic
          const baseColorId = colorId.split('_')[0]!;
          const lengthLabel = colorId.includes('_2')
            ? 'SHORT'
            : colorId.includes('_1')
            ? 'TALL'
            : 'REGULAR';

          const variantId = `${product.id}-${colorId}`;

          // 2. Prepare variant insert record with swatch and refColor
          variantInsertRecords.push([
            variantId,
            product.id,
            color.name,
            baseColorId,
            lengthLabel,
            color.price,
            color.list_price,
            JSON.stringify(color.available_sizes),
            JSON.stringify(color.all_sizes),
            color.swatch || '',
            color.refColor || '',
            scrapeTime, // last_seen_at for new inserts
          ]);
          variantUpdateRecords.push([
            scrapeTime,
            color.price,
            color.list_price,
            JSON.stringify(color.available_sizes),
            JSON.stringify(color.all_sizes),
            color.swatch || '',
            color.refColor || '',
            variantId,
          ]); // parameters for UPDATE

          // Price history — only insert when price actually changed
          const existingVariant = existingVariantsMap.get(variantId);
          if (
            !existingVariant ||
            existingVariant.price !== color.price ||
            existingVariant.listPrice !== color.list_price
          ) {
            priceInsertRecords.push([
              variantId,
              color.price,
              color.list_price,
              scrapeTime,
            ]);
          }

          // Check for restock
          const oldSizes = existingVariant?.sizes;
          const newSizes = color.available_sizes || [];
          if (oldSizes && oldSizes.length === 0 && newSizes.length > 0) {
            restockInsertRecords.push([variantId, scrapeTime]);
          }

          for (const imageId of color.images) {
            imageInsertRecords.push([imageId, product.id, variantId]);
          }
        }
      }

      // 3. Process store availability
      for (const store of product.storeAvailability) {
        for (const avail of store.availability) {
          // Find the variant ID for this color
          const matchingColor = product.colors.find((c) =>
            c.colorIds.some((cid) => cid.split('_')[0] === avail.colorId)
          );
          if (matchingColor) {
            const colorId = matchingColor.colorIds.find(
              (cid) => cid.split('_')[0] === avail.colorId
            );
            if (colorId) {
              const variantId = `${product.id}-${colorId}`;
              storeAvailabilityRecords.push([
                store.storeId,
                variantId,
                avail.colorId,
                JSON.stringify(avail.sizes),
                scrapeTime,
              ]);
            }
          }
        }
      }
    }
  }

  console.log(
    `Prepared ${productInsertRecords.length} products and ${variantInsertRecords.length} variants for processing.`
  );
  console.log(
    `Prepared ${storeAvailabilityRecords.length} store availability records.`
  );

  // --- Counting before insertion for change tracking ---
  const initialProductCount = await getCountPromise(DB, 'products');
  const initialVariantCount = await getCountPromise(DB, 'variants');
  const initialImageCount = await getCountPromise(DB, 'images');

  // --- Step 1: Insert New Records (INSERT OR IGNORE) ---
  console.log('\n--- Step 1: Inserting new records (INSERT OR IGNORE) ---');

  // Products (with all new columns)
  await prepareRunAll(
    DB,
    `INSERT OR IGNORE INTO products (id, name, display_name, slug, description, designers_notes, fabric, brand, warmth, fit, category, rating, review_count, sustainability, neckline, sleeve, style, default_image, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    productInsertRecords,
    'Products'
  );

  // Variants (with swatch and ref_color)
  await prepareRunAll(
    DB,
    `INSERT OR IGNORE INTO variants (id, product_id, color, color_id, length, price, list_price, available_sizes, all_sizes, swatch, ref_color, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    variantInsertRecords,
    'Variants'
  );

  // Images
  await prepareRunAll(
    DB,
    `INSERT OR IGNORE INTO images (id, product_id, variant_id) VALUES (?, ?, ?)`,
    imageInsertRecords,
    'Image IDs'
  );

  // Prices
  await prepareRunAll(
    DB,
    `INSERT INTO prices (variant_id, price, list_price, timestamp) VALUES (?, ?, ?, ?)`,
    priceInsertRecords,
    'Prices'
  );

  // Restocks
  await prepareRunAll(
    DB,
    `INSERT INTO restocks (variant_id, timestamp) VALUES (?, ?)`,
    restockInsertRecords,
    'Restocks'
  );

  // Store Availability (clear old data for this scrape and insert new)
  await runPromise.call(
    DB,
    `DELETE FROM store_availability WHERE timestamp < ?`,
    [scrapeTime]
  );
  await prepareRunAll(
    DB,
    `INSERT OR IGNORE INTO store_availability (store_id, variant_id, color_id, available_sizes, timestamp) VALUES (?, ?, ?, ?, ?)`,
    storeAvailabilityRecords,
    'Store Availability'
  );

  // Populate stores table from stores.json and discovered store IDs
  const storeIds = new Set(storeAvailabilityRecords.map((r) => r[0] as string));
  const storeInserts: any[][] = [];
  for (const storeId of storeIds) {
    const storeInfo = (storeData.stores as Record<string, any>)[storeId] || {
      name: 'Unknown',
      city: '',
      province: '',
      country: '',
    };
    storeInserts.push([
      storeId,
      storeInfo.name,
      storeInfo.city,
      storeInfo.province,
      storeInfo.country,
    ]);
  }
  await prepareRunAll(
    DB,
    `INSERT OR REPLACE INTO stores (id, name, city, province, country) VALUES (?, ?, ?, ?, ?)`,
    storeInserts,
    'Stores'
  );

  // --- Step 2: Update last_seen_at for all records found in current scrape ---
  console.log('\n--- Step 2: Updating last_seen_at for current records ---');

  // Update last_seen_at for products (with all new fields)
  await prepareRunAll(
    DB,
    `UPDATE products SET last_seen_at = ?, display_name = ?, description = ?, designers_notes = ?, fabric = ?, brand = ?, warmth = ?, fit = ?, category = ?, rating = ?, review_count = ?, sustainability = ?, neckline = ?, sleeve = ?, style = ?, default_image = ? WHERE id = ?`,
    productUpdateRecords,
    'Product Status'
  );

  // Update last_seen_at for variants (with swatch and ref_color)
  await prepareRunAll(
    DB,
    `UPDATE variants SET last_seen_at = ?, price = ?, list_price = ?, available_sizes = ?, all_sizes = ?, swatch = ?, ref_color = ? WHERE id = ?`,
    variantUpdateRecords,
    'Variant Status'
  );

  // --- Step 3: Image Download ---
  if (process.env.SKIP_IMAGE_DOWNLOAD === 'true') {
    console.log(
      '\n--- Step 3: Skipping image download (SKIP_IMAGE_DOWNLOAD=true) ---'
    );
  } else {
    console.log('\n--- Step 3: Downloading image data (BLOB) ---');

    // Query for image records where the image BLOB is NULL
    const pendingDownloads: ImageDownloadRecord[] = await allPromise.call(
      DB,
      `
    SELECT id, product_id, variant_id
    FROM images 
    WHERE image IS NULL
  `
    );

    if (pendingDownloads.length > 0) {
      console.log(
        `Found ${pendingDownloads.length} images to download. Running ${MAX_CONCURRENT_DOWNLOADS} in parallel.`
      );

      const downloadAdvance = createProgressBar(
        pendingDownloads.length,
        'Image Downloads'
      );

      // --- WORKER POOL LOGIC ---
      // 1. Create a copy of the list to act as a queue
      const queue = [...pendingDownloads];

      // 2. Define the worker logic: Pick an item from queue, process it, repeat until queue empty
      const worker = async (workerId: number) => {
        while (queue.length > 0) {
          // Shift is not atomic in JS/TS in the strict threading sense,
          // but Node.js is single-threaded event loop, so this is safe!
          const record = queue.shift();
          if (record) {
            await downloadImageWithPuppeteer(DB, record, downloadAdvance);
          }
        }
      };

      // 3. Create an array of workers based on MAX_CONCURRENT_DOWNLOADS
      // We limit it by queue length so we don't spawn 5 workers for 1 item
      const numWorkers = Math.min(
        MAX_CONCURRENT_DOWNLOADS,
        pendingDownloads.length
      );
      const workers = Array.from({ length: numWorkers }, (_, i) =>
        worker(i + 1)
      );

      // 4. Wait for all workers to finish
      await Promise.all(workers);
    } else {
      console.log('No new images found to download. Moving on.');
    }
  }

  // --- Step 4: Reporting ---

  // Get final counts
  const finalProductCount = await getCountPromise(DB, 'products');
  const finalVariantCount = await getCountPromise(DB, 'variants');
  const finalImageCount = await getCountPromise(DB, 'images');

  const newProductCount = finalProductCount - initialProductCount;
  const newVariantCount = finalVariantCount - initialVariantCount;
  const newImageCount = finalImageCount - initialImageCount;

  // New query: Report newly added products
  const newlyAddedProducts: any[] = await allPromise.call(
    DB,
    `
    SELECT id, name, slug 
    FROM products 
    WHERE added_at = ?
    ORDER BY name
  `,
    [scrapeTime]
  );

  console.log('\n--- Scraping and Tracking Report ---');
  console.log(`Scrape Run Time: ${scrapeTime}`);
  console.log('-----------------------------------');

  // New items report
  console.log(`New Products Added: ${newProductCount}`);
  if (newlyAddedProducts.length > 0) {
    console.log(`  - Newly Added Products (${newlyAddedProducts.length}):`);
    newlyAddedProducts.forEach((p: any) => {
      console.log(
        `    -> [${p.id}] ${p.name} https://www.aritzia.com/en/product/${p.slug}`
      );
    });
  }
  console.log(`New Variants Added: ${newVariantCount}`);

  console.log(`New Image IDs Tracked: ${newImageCount}`);
}
