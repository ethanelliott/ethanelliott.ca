import { Router, Request, Response } from 'express';
import { getOllamaClient, Message } from './ollama';
import { allPromise, getDB, getPromise, runPromise } from './db';
import dayjs from 'dayjs';

const router = Router();

// ==================== HELPER: SSE Stream ====================

function setupSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Helper to get last scan time
async function getLastScanTime(db: any): Promise<string> {
  const lastScanRow = await getPromise.call(
    db,
    'SELECT MAX(last_seen_at) as max_time FROM variants'
  );
  return lastScanRow ? lastScanRow.max_time : new Date().toISOString();
}

// ==================== AI Product Summary (Streaming) ====================

router.get('/api/ai/summary/:productId', async (req: Request, res: Response) => {
  const { productId } = req.params;
  const db = getDB();

  try {
    // Check cache first
    const cached = await getPromise.call(
      db,
      'SELECT summary, created_at FROM ai_summaries WHERE product_id = ?',
      [productId]
    );
    
    // Cache valid for 24 hours
    if (cached && cached.summary) {
      const cacheAge = dayjs().diff(dayjs(cached.created_at), 'hour');
      if (cacheAge < 24) {
        setupSSE(res);
        sendSSE(res, 'content', { content: cached.summary, done: false, thinking: false, cached: true });
        sendSSE(res, 'done', { done: true });
        res.end();
        return;
      }
    }

    // Fetch product data
    const product = await getPromise.call(db, 'SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Fetch variant price range
    const priceInfo = await getPromise.call(
      db,
      `SELECT MIN(price) as min_price, MAX(price) as max_price, MIN(list_price) as min_list, MAX(list_price) as max_list
       FROM variants WHERE product_id = ?`,
      [productId]
    );

    // Fetch price history for trend analysis
    const priceHistory = await allPromise.call(
      db,
      `SELECT p.price, p.timestamp FROM prices p
       JOIN variants v ON p.variant_id = v.id
       WHERE v.product_id = ?
       ORDER BY p.timestamp DESC LIMIT 20`,
      [productId]
    );

    const fabric = product.fabric ? JSON.parse(product.fabric) : [];
    const category = product.category ? JSON.parse(product.category) : [];
    const sustainability = product.sustainability ? JSON.parse(product.sustainability) : [];

    const systemPrompt = `You are a fashion-savvy shopping assistant for Aritzia products. Give concise, opinionated, helpful summaries. Be honest about value. Use 2-3 short paragraphs max. Include: what the product is best for, value assessment, and any notable features. Do NOT use markdown headers.`;

    const userPrompt = `Analyze this Aritzia product:

**${product.display_name || product.name}**
- Brand: ${product.brand || 'Aritzia'}
- Category: ${category.join(', ') || 'N/A'}
- Fabric: ${fabric.join(', ') || 'N/A'}
- Current price: $${priceInfo?.min_price || 'N/A'}${priceInfo?.min_price !== priceInfo?.max_price ? ` - $${priceInfo?.max_price}` : ''}
- List price: $${priceInfo?.min_list || 'N/A'}${priceInfo?.min_list !== priceInfo?.max_list ? ` - $${priceInfo?.max_list}` : ''}
${priceInfo?.min_price < priceInfo?.min_list ? `- ON SALE: ${Math.round((1 - priceInfo.min_price / priceInfo.min_list) * 100)}% off` : ''}
- Rating: ${product.rating || 'N/A'}/5 (${product.review_count || 0} reviews)
- Sustainability: ${sustainability.length > 0 ? sustainability.join(', ') : 'None listed'}
- Description: ${product.description || 'N/A'}
${product.designers_notes ? `- Designer's notes: ${product.designers_notes}` : ''}
- Price trend: ${priceHistory.length > 1 ? `${priceHistory.length} price points recorded` : 'No history yet'}

Give a quick, opinionated summary: is this worth buying? What's it best for? Any concerns?`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    setupSSE(res);
    const ollama = getOllamaClient();
    let fullContent = '';

    for await (const chunk of ollama.chatStream(messages, { temperature: 0.7 })) {
      fullContent += chunk.content;
      sendSSE(res, 'content', {
        content: chunk.content,
        done: chunk.done,
        thinking: chunk.thinking || false,
      });
    }

    // Cache the result (strip thinking blocks for cache)
    const cleanContent = fullContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (cleanContent) {
      await runPromise.call(
        db,
        `INSERT OR REPLACE INTO ai_summaries (product_id, summary, created_at) VALUES (?, ?, ?)`,
        [productId, cleanContent, new Date().toISOString()]
      );
    }

    sendSSE(res, 'done', { done: true });
    res.end();
  } catch (error: any) {
    console.error('AI Summary error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else {
      sendSSE(res, 'error', { error: error.message });
      res.end();
    }
  }
});

// ==================== AI Natural Language Search (Streaming) ====================

router.get('/api/ai/search', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const db = getDB();

  if (!query || query.length < 3) {
    res.status(400).json({ error: 'Query must be at least 3 characters' });
    return;
  }

  try {
    const lastScanTime = await getLastScanTime(db);

    // Get summary of what's in the database for context
    const brands = await allPromise.call(db, `SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand`);
    const categoryRows = await allPromise.call(db, `SELECT DISTINCT category FROM products WHERE category IS NOT NULL`);
    const categoriesSet = new Set<string>();
    categoryRows.forEach((r: any) => {
      try { JSON.parse(r.category).forEach((c: string) => categoriesSet.add(c)); } catch {}
    });

    const priceRange = await getPromise.call(db, `SELECT MIN(price) as min_price, MAX(price) as max_price FROM variants WHERE last_seen_at = ?`, [lastScanTime]);

    const systemPrompt = `You are a search query parser for an Aritzia clothing database. Extract structured filters from natural language queries.

Available brands: ${brands.map((b: any) => b.brand).join(', ')}
Available categories: ${Array.from(categoriesSet).join(', ')}
Price range in database: $${priceRange?.min_price} - $${priceRange?.max_price}
Available sizes: 2XS, XS, S, M, L, XL, 2XL, 3XL
Color examples: Black, White, Heather Birch, Deep Camel, etc.

IMPORTANT: Respond with ONLY valid JSON, no other text. Use this exact schema:`;

    const userPrompt = `Parse this shopping query: "${query}"

Return JSON:
{
  "searchTerms": ["keyword1", "keyword2"],
  "brand": "brand name or null",
  "category": "category or null",
  "minPrice": number or null,
  "maxPrice": number or null,
  "size": "size or null",
  "color": "color name or null",
  "onSale": true/false/null,
  "sortBy": "price-low" | "price-high" | "rating" | "newest" | "discount" | null,
  "explanation": "brief explanation of what you understood from the query"
}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    setupSSE(res);
    const ollama = getOllamaClient();

    // First: stream the AI's interpretation
    sendSSE(res, 'status', { message: 'Understanding your query...' });

    let fullResponse = '';
    for await (const chunk of ollama.chatStream(messages, { temperature: 0.1 })) {
      fullResponse += chunk.content;
      sendSSE(res, 'thinking', {
        content: chunk.content,
        thinking: chunk.thinking || false,
      });
    }

    // Parse AI response to extract filters
    let filters: any = {};
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        filters = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse AI search response:', parseErr);
    }

    sendSSE(res, 'filters', { filters });

    // Build SQL query from parsed filters
    let sql = `
      SELECT v.id, v.color, v.color_id, v.length, v.price, v.list_price,
             v.available_sizes, v.swatch, v.ref_color,
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

    // Apply search terms
    if (filters.searchTerms && filters.searchTerms.length > 0) {
      const termConditions = filters.searchTerms.map(() => `(p.name LIKE ? OR p.display_name LIKE ? OR p.description LIKE ? OR v.color LIKE ?)`);
      sql += ` AND (${termConditions.join(' OR ')})`;
      filters.searchTerms.forEach((term: string) => {
        params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
      });
    }

    if (filters.brand) {
      sql += ` AND p.brand = ?`;
      params.push(filters.brand);
    }

    if (filters.category) {
      sql += ` AND p.category LIKE ?`;
      params.push(`%${filters.category}%`);
    }

    if (filters.color) {
      sql += ` AND v.color LIKE ?`;
      params.push(`%${filters.color}%`);
    }

    if (filters.size) {
      sql += ` AND v.available_sizes LIKE ?`;
      params.push(`%${filters.size}%`);
    }

    if (filters.minPrice != null) {
      sql += ` AND v.price >= ?`;
      params.push(filters.minPrice);
    }

    if (filters.maxPrice != null) {
      sql += ` AND v.price <= ?`;
      params.push(filters.maxPrice);
    }

    if (filters.onSale === true) {
      sql += ` AND v.price < v.list_price`;
    }

    // Sorting
    switch (filters.sortBy) {
      case 'price-low': sql += ` ORDER BY v.price ASC`; break;
      case 'price-high': sql += ` ORDER BY v.price DESC`; break;
      case 'rating': sql += ` ORDER BY p.rating DESC, p.review_count DESC`; break;
      case 'discount': sql += ` ORDER BY ((v.list_price - v.price) / v.list_price) DESC`; break;
      case 'newest': sql += ` ORDER BY v.added_at DESC`; break;
      default: sql += ` ORDER BY p.review_count DESC`; break;
    }

    sql += ` LIMIT 50`;

    const results = await allPromise.call(db, sql, params);

    results.forEach((v: any) => {
      v.available_sizes_arr = v.available_sizes ? JSON.parse(v.available_sizes) : [];
      v.category_arr = v.category ? JSON.parse(v.category) : [];
      v.sustainability_arr = v.sustainability ? JSON.parse(v.sustainability) : [];
    });

    sendSSE(res, 'results', { products: results, count: results.length, explanation: filters.explanation || '' });
    sendSSE(res, 'done', { done: true });
    res.end();
  } catch (error: any) {
    console.error('AI Search error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else {
      sendSSE(res, 'error', { error: error.message });
      res.end();
    }
  }
});

// ==================== AI Style Advisor (Streaming) ====================

router.get('/api/ai/style', async (req: Request, res: Response) => {
  const occasion = (req.query.occasion as string) || '';
  const db = getDB();

  if (!occasion || occasion.length < 3) {
    res.status(400).json({ error: 'Please describe an occasion or style' });
    return;
  }

  try {
    const lastScanTime = await getLastScanTime(db);

    // Get a diverse sample of current products for the AI to choose from
    const sampleProducts = await allPromise.call(
      db,
      `SELECT p.id, p.name, p.display_name, p.brand, p.category, p.fabric,
              p.rating, p.review_count, p.sustainability, p.warmth,
              MIN(v.price) as price, MAX(v.list_price) as list_price,
              GROUP_CONCAT(DISTINCT v.color) as colors
       FROM products p
       JOIN variants v ON p.id = v.product_id
       WHERE v.last_seen_at = ? AND v.available_sizes != '[]'
       GROUP BY p.id
       ORDER BY p.review_count DESC
       LIMIT 80`,
      [lastScanTime]
    );

    const productList = sampleProducts.map((p: any, i: number) => {
      const cats = p.category ? JSON.parse(p.category) : [];
      const fab = p.fabric ? JSON.parse(p.fabric) : [];
      return `[${i}] ${p.display_name || p.name} | ${p.brand || 'Aritzia'} | $${p.price}${p.price < p.list_price ? ` (sale from $${p.list_price})` : ''} | ${cats.join(', ')} | Fabric: ${fab.join(', ')} | Rating: ${p.rating}/5 | Colors: ${p.colors}`;
    }).join('\n');

    const systemPrompt = `You are a fashion stylist assistant for Aritzia. The user will describe an occasion, vibe, or style goal. Recommend 3-5 products from the available inventory that would work well together as an outfit or collection.

For each recommendation, explain WHY it works for their needs. Be specific about colors and styling tips. Be enthusiastic but honest.

Format your response as natural prose with product names in **bold**. At the end, include a JSON block with the product indices like: <!--PICKS:[0,5,12]-->`;

    const userPrompt = `I need outfit recommendations for: "${occasion}"

Here are the products currently available:
${productList}

Recommend 3-5 items that work together. Explain your styling choices.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    setupSSE(res);
    const ollama = getOllamaClient();
    let fullResponse = '';

    sendSSE(res, 'status', { message: 'Curating your style recommendations...' });

    for await (const chunk of ollama.chatStream(messages, { temperature: 0.8 })) {
      fullResponse += chunk.content;
      sendSSE(res, 'content', {
        content: chunk.content,
        done: chunk.done,
        thinking: chunk.thinking || false,
      });
    }

    // Extract product picks from response
    const picksMatch = fullResponse.match(/<!--PICKS:\[([\d,\s]+)\]-->/);
    if (picksMatch) {
      try {
        const indices = JSON.parse(`[${picksMatch[1]}]`);
        const picks = indices
          .filter((i: number) => i >= 0 && i < sampleProducts.length)
          .map((i: number) => {
            const p = sampleProducts[i];
            return {
              id: p.id,
              name: p.display_name || p.name,
              price: p.price,
              list_price: p.list_price,
              brand: p.brand,
              rating: p.rating,
              colors: p.colors,
            };
          });
        sendSSE(res, 'picks', { products: picks });
      } catch {}
    }

    sendSSE(res, 'done', { done: true });
    res.end();
  } catch (error: any) {
    console.error('AI Style error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else {
      sendSSE(res, 'error', { error: error.message });
      res.end();
    }
  }
});

// ==================== AI Outfit Builder (Streaming) ====================

router.get('/api/ai/outfit/:productId', async (req: Request, res: Response) => {
  const { productId } = req.params;
  const db = getDB();

  try {
    const lastScanTime = await getLastScanTime(db);

    const product = await getPromise.call(db, 'SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Get other available products for pairing
    const otherProducts = await allPromise.call(
      db,
      `SELECT p.id, p.name, p.display_name, p.brand, p.category, p.fabric,
              p.rating, p.review_count, p.sustainability, p.warmth,
              MIN(v.price) as price, MAX(v.list_price) as list_price,
              GROUP_CONCAT(DISTINCT v.color) as colors
       FROM products p
       JOIN variants v ON p.id = v.product_id
       WHERE v.last_seen_at = ? AND p.id != ? AND v.available_sizes != '[]'
       GROUP BY p.id
       ORDER BY p.review_count DESC
       LIMIT 60`,
      [lastScanTime, productId]
    );

    const productList = otherProducts.map((p: any, i: number) => {
      const cats = p.category ? JSON.parse(p.category) : [];
      const fab = p.fabric ? JSON.parse(p.fabric) : [];
      return `[${i}] ${p.display_name || p.name} | $${p.price} | ${cats.join(', ')} | ${fab.join(', ')} | Colors: ${p.colors}`;
    }).join('\n');

    const fabric = product.fabric ? JSON.parse(product.fabric) : [];
    const category = product.category ? JSON.parse(product.category) : [];

    const systemPrompt = `You are a fashion stylist for Aritzia. The user has selected a product and wants to know what else to pair with it for a complete outfit. Suggest 2-4 complementary pieces from the available inventory.

Consider: color coordination, style cohesion, occasion versatility, and layering. Be specific about which colors to pair.

Format naturally with product names in **bold**. End with: <!--PICKS:[indices]-->`;

    const userPrompt = `I just picked: **${product.display_name || product.name}** (${category.join(', ')}, ${fabric.join(', ')}, $${product.price || 'N/A'})

What should I pair it with from these available items?
${productList}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    setupSSE(res);
    const ollama = getOllamaClient();
    let fullResponse = '';

    sendSSE(res, 'status', { message: `Finding pieces to pair with ${product.display_name || product.name}...` });

    for await (const chunk of ollama.chatStream(messages, { temperature: 0.8 })) {
      fullResponse += chunk.content;
      sendSSE(res, 'content', {
        content: chunk.content,
        done: chunk.done,
        thinking: chunk.thinking || false,
      });
    }

    // Extract picks
    const picksMatch = fullResponse.match(/<!--PICKS:\[([\d,\s]+)\]-->/);
    if (picksMatch) {
      try {
        const indices = JSON.parse(`[${picksMatch[1]}]`);
        const picks = indices
          .filter((i: number) => i >= 0 && i < otherProducts.length)
          .map((i: number) => {
            const p = otherProducts[i];
            return {
              id: p.id,
              name: p.display_name || p.name,
              price: p.price,
              list_price: p.list_price,
              rating: p.rating,
            };
          });
        sendSSE(res, 'picks', { products: picks });
      } catch {}
    }

    sendSSE(res, 'done', { done: true });
    res.end();
  } catch (error: any) {
    console.error('AI Outfit error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else {
      sendSSE(res, 'error', { error: error.message });
      res.end();
    }
  }
});

// ==================== AI Deals Report (Streaming) ====================

router.get('/api/ai/deals', async (req: Request, res: Response) => {
  const db = getDB();

  try {
    const lastScanTime = await getLastScanTime(db);

    // Get biggest price drops (comparing current price to historical max)
    const bigDeals = await allPromise.call(
      db,
      `SELECT p.id, p.name, p.display_name, p.brand, p.category, p.rating, p.review_count,
              v.color, v.price, v.list_price, v.id as variant_id,
              (SELECT MAX(pr.price) FROM prices pr WHERE pr.variant_id = v.id) as highest_price,
              (SELECT MIN(pr.price) FROM prices pr WHERE pr.variant_id = v.id) as lowest_ever
       FROM variants v
       JOIN products p ON v.product_id = p.id
       WHERE v.last_seen_at = ? AND v.price < v.list_price
       ORDER BY ((v.list_price - v.price) / v.list_price) DESC
       LIMIT 20`,
      [lastScanTime]
    );

    // Get recent restocks
    const recentRestocks = await allPromise.call(
      db,
      `SELECT p.name, p.display_name, v.color, v.price, r.timestamp
       FROM restocks r
       JOIN variants v ON r.variant_id = v.id
       JOIN products p ON v.product_id = p.id
       ORDER BY r.timestamp DESC
       LIMIT 10`
    );

    const dealsInfo = bigDeals.map((d: any) => {
      const discount = Math.round((1 - d.price / d.list_price) * 100);
      return `- ${d.display_name || d.name} in ${d.color}: $${d.price} (was $${d.list_price}, ${discount}% off, lowest ever: $${d.lowest_ever || d.price}) | Rating: ${d.rating}/5 (${d.review_count} reviews)`;
    }).join('\n');

    const restocksInfo = recentRestocks.map((r: any) =>
      `- ${r.display_name || r.name} in ${r.color}: $${r.price} (restocked ${dayjs(r.timestamp).fromNow()})`
    ).join('\n');

    const systemPrompt = `You are a deals analyst for Aritzia shoppers. Write an engaging, concise deals report highlighting the best current values. Be enthusiastic about genuinely good deals, skeptical about marginal ones. Group by theme (best discounts, popular items on sale, recent restocks). Use casual but informative tone. Keep it under 400 words.`;

    const userPrompt = `Write this week's Aritzia deals report.

TOP DEALS (by discount):
${dealsInfo || 'No items currently on sale.'}

RECENT RESTOCKS:
${restocksInfo || 'No recent restocks.'}

Write an engaging summary highlighting the best values.`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    setupSSE(res);
    const ollama = getOllamaClient();

    sendSSE(res, 'status', { message: 'Analyzing current deals...' });

    for await (const chunk of ollama.chatStream(messages, { temperature: 0.7 })) {
      sendSSE(res, 'content', {
        content: chunk.content,
        done: chunk.done,
        thinking: chunk.thinking || false,
      });
    }

    sendSSE(res, 'done', { done: true });
    res.end();
  } catch (error: any) {
    console.error('AI Deals error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable' });
    } else {
      sendSSE(res, 'error', { error: error.message });
      res.end();
    }
  }
});

export default router;
