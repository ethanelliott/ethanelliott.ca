# Aritzia Scanner — Audit: Bugs, Inconsistencies & Improvements

Audit of `apps/aritzia-scanner` covering `main.ts`, `ai-routes.ts`, `scraper.ts`, `db.ts`,
`ollama.ts`, all 18 EJS views, and `styles.css` (~7,900 lines total).

## Implementation status

**All items below have been implemented**, with these deliberate exceptions:

- **1.12 (fleece-only scrape): WON'T FIX — intentional.** Scanning the `fleece`
  query is the whole point of the app; `scraper.ts` keeps `query: 'fleece'`.
- **gzip compression**: skipped to avoid adding a new npm dependency to the
  deploy pipeline. Static assets get `maxAge` cache headers instead.
- **Image resizing via sharp**: skipped (native dependency). Mitigated instead
  by capping new image downloads at `w_1200` via the CDN transform and fixing
  layout shift with `aspect-ratio` CSS.
- **§6 "diff before UPDATE" in the scraper**: not done — `last_seen_at` must be
  written for every variant on every scan (it drives active/discontinued
  tracking), so the per-row UPDATE can't be skipped.

Legend: 🔴 bug / broken behavior · 🟠 inconsistency between pages · 🟡 improvement

---

## 1. Correctness bugs

### 1.1 🔴 Size filter matches the wrong sizes on `/` and `/sale`
`available_sizes` is a JSON string like `["2XS","XS","S"]`. The homepage and sale routes filter with
`available_sizes LIKE '%S%'`, so filtering for **S** also matches XS/2XS, and **XL** matches 2XL/3XL.
The store detail route does it correctly with `LIKE '%"S"%'` (quoted). Fix: use the quoted form
everywhere (or better, a normalized `variant_sizes` table).
- `main.ts:313` (`/`), `main.ts:622` (`/sale`), correct version at `main.ts:1294`.

### 1.2 🔴 Sale page computes a discount % and never shows it
`/sale` sets `item.discount_percent` (`main.ts:645`) but `sale.ejs` never renders it — the sale page
is the only listing without a discount badge, while the homepage and favorites show `% OFF` overlays.

### 1.3 🔴 Sort dropdown on `/products` doesn't match the route
`/products` reuses `index.ejs`. The dropdown offers `newest / price-low / price-high / rating / discount`,
but the route implements `name (default) / reviews / price-* / rating`. Result: default sort is `name`,
which isn't an option, so the dropdown displays "Newest" while the list is alphabetical; choosing
"Discount" silently sorts by name. The route also supports `reviews`, which no page offers.
- `main.ts:506-523`, `index.ejs:60-66`.

### 1.4 🔴 minPrice/maxPrice are dead filters
The `/` route parses and applies `minPrice`/`maxPrice` (`main.ts:277-282, 317-325`) but no form input
exists anywhere to set them. Only the pagination links would preserve them — and even those drop a
legitimate `minPrice=0` (`if (locals.minPrice && minPrice)`, `index.ejs:204-205`).

### 1.5 🔴 Favorites loading skeleton is unstyled
`favorites.ejs:23-29` uses `.skeleton-container` / `.skeleton-shimmer`; neither class exists in
`styles.css` (only the `shimmer` keyframes do). The loading state renders as an invisible empty div.

### 1.6 🔴 Favorites count badge only works on two pages
`nav.ejs` renders `#fav-count` on every page, but `updateFavCount()` lives in `index.ejs`'s inline
script. The badge stays empty on product, variant, sale, restocks, stores, AI pages — and even on
the favorites page itself. The favorites/localStorage script should live in a shared JS file.

### 1.7 🔴 `getLastScanTime` fallback never triggers
`SELECT MAX(last_seen_at) ...` always returns a row (with `max_time: null` on an empty DB), so
`lastScanRow ? lastScanRow.max_time : ...` returns `null` rather than the intended fallback. Every
`WHERE last_seen_at = ?` then matches nothing. Duplicated in `main.ts:22-28` and `ai-routes.ts:66-72`.

### 1.8 🔴 Mixed timestamp formats in the same columns
The scraper writes `new Date().toISOString()` (`2026-06-10T18:00:00.000Z`) while SQLite column
defaults write `strftime('%Y-%m-%d %H:%M:%f')` (space-separated, no zone). Both formats coexist in
`added_at` / `last_seen_at` / `timestamp` columns; lexicographic `MAX()`/`ORDER BY` across the two
formats is not chronologically correct (`T` sorts after ` `). Pick one format (ISO-8601 UTC) and
backfill.

### 1.9 🔴 Relative times in the AI deals report are timezone-shifted
`ai-routes.ts:716` uses `dayjs(r.timestamp).fromNow()` while everything else uses
`dayjs.utc(...).fromNow()`. Restock times fed to the LLM are off by the server's UTC offset.

### 1.10 🔴 "Discontinued" flips on any partial scrape
Active = `last_seen_at == MAX(last_seen_at)` across the whole table. If a scrape fails midway (or two
scrapes interleave), everything not yet updated instantly renders as discontinued. A `scans` table
with a scan id + completion flag would make this robust.

### 1.11 🔴 No scrape concurrency guard, and `/api/update` is an open trigger
`updateDatabase()` can run concurrently: initial run at boot, the 30-min cron (puppeteer image
downloads can easily exceed 30 min), and unauthenticated `GET /api/update` (`main.ts:177`). Interleaved
runs corrupt the `last_seen_at` logic above. Add an in-process mutex + skip-if-running, and protect or
remove the endpoint (GETs with side effects also invite prefetchers/crawlers to trigger scrapes).

### 1.12 🔴 Scraper only ever searches "fleece"
`scraper.ts:147` hardcodes `query: 'fleece'` with one page of max 1000 Algolia hits and no pagination.
The app presents itself as a full scanner but only tracks fleece search results. Should iterate
queries/categories or use empty-query browse with pagination.

### 1.13 🔴 Store availability has a delete-then-insert gap
`scraper.ts:500-510` deletes all old `store_availability` rows before inserting new ones. A failure in
between loses all store data, and concurrent readers see an empty state mid-scrape. Insert first,
then delete rows from older timestamps (or swap within a transaction).

### 1.14 🔴 Division by zero in discount sort
`ORDER BY ((v.list_price - v.price) / v.list_price)` (homepage, sale, AI search) yields NULL when
`list_price` is 0 — the scraper defaults missing list prices to 0 (`scraper.ts:245`).

### 1.15 🔴 AI search JSON can be parsed out of the reasoning block
In `/api/ai/search`, `fullResponse` accumulates *all* chunks including `<think>` content
(`ai-routes.ts:290-309`), then `match(/\{[\s\S]*\}/)` extracts a JSON blob — which can come from the
model's reasoning instead of its answer. `streamAIWithMarkdown` gets this right by separating thinking
content; the search route should too. Also `ollama.ts` leaks the literal `<think>`/`</think>` tags
into the streamed reasoning text.

### 1.16 🔴 `images` schema forces fallback subqueries everywhere
`images.id` is PRIMARY KEY with `INSERT OR IGNORE`, so an image shared by several variants is linked
to only the first one. That's why six different queries carry the
`COALESCE((SELECT ... variant_id = v.id), (SELECT ... same product+color))` workaround. Either make the
link table `(image_id, variant_id)` many-to-many or store a canonical `thumbnail_id` on variants.

### 1.17 🟡 AI search "thinking" event appends into a hidden element
`ai-routes.ts` emits non-reasoning tokens as event `thinking`; `ai_search.ejs:77-82` appends them to
`#ai-reasoning` without unhiding it. Works only by accident when a `reasoning` event happened first.

---

## 2. Security

### 2.1 🔴 XSS: favorites page renders scraped data unescaped
`favorites.ejs` builds cards via string concatenation with no escaping for `name`, `color`, `length`,
ids. Product names come from a third-party API → stored XSS. `ai_search.ejs` escapes the same fields;
favorites must too.

### 2.2 🔴 XSS: LLM output rendered as raw HTML without sanitization
`marked.parse()` output is injected via `innerHTML` on product/ai pages. `marked` does **not** sanitize
— raw HTML in model output passes straight through. The `filters` display in `ai_search.ejs:105-120`
also injects AI-derived strings (`searchTerms`, `brand`, …) into `innerHTML` unescaped. Sanitize with
DOMPurify client-side (or `sanitize-html` server-side before sending the SSE event).

### 2.3 🟡 `designers_notes` rendered with `<%-`
`product.ejs:22-23` outputs scraped text raw to fix HTML entities. Decode entities server-side once
(at scrape time) and render escaped with `<%=`.

### 2.4 🟡 `/api/update` unauthenticated (see 1.11).

---

## 3. Cross-page inconsistencies (rendering/UX)

### 3.1 🟠 No shared layout — 18 copies of the page shell
Every view duplicates DOCTYPE/head/nav-include/scripts. `colors.ejs` even uses a different indentation
and attribute style. Introduce `partials/head.ejs` + `partials/foot.ejs` (or express-ejs-layouts), one
shared `app.js` for favorites/theme/nav, and a favicon (currently 404s on every page).

### 3.2 🟠 Product card markup re-implemented ~10 times, each differently
Server-side: index (active + discontinued variants of it), sale, restocks, discontinued,
color_products, category_products, store_detail. Client-side string-built: favorites, ai_search,
ai_style picks, product outfit picks. Differences that read as bugs:
- **Favorite button**: only homepage + favorites. Missing on sale, restocks, AI results, store detail, discontinued.
- **Discount overlay**: only homepage + favorites (sale computes it and drops it — see 1.2).
- **Rating stars**: AI search cards show them; index/sale/restocks/category cards don't despite selecting `rating`/`review_count` in SQL.
- **Price**: `color_products` cards show *no* price or rating at all; `discontinued` cards select prices but don't render them.
- **Name field**: `color_products` uses `product.name` while everything else prefers `display_name`.
- **Link target**: `color_products` links to variant pages, `category_products` to product pages.
Fix: one `partials/product_card.ejs` with options, and one client-side `renderProductCard()` in shared JS.

### 3.3 🟠 Price formatting is raw floats
`$<%= price %>` renders `$49.5` / `$118.99999`. No `toFixed(2)`/`Intl.NumberFormat` anywhere; add a
single `formatPrice` helper (server `res.locals` + shared JS).

### 3.4 🟠 Filter/sort UX differs per page
- index/sale/store_detail: "Go" submit button; category_products: auto-submit `onchange`; product page length filter: pure client-side.
- Sort option sets differ from what each route supports (see 1.3).
- `/sale` and `/stores/:id` size dropdowns behave differently (see 1.1).

### 3.5 🟠 Empty states: four different patterns
Homepage renders *nothing at all* for 0 results (no message); sale/restocks/stores use
`.no-results`; ai_search uses `.empty-state`; favorites has a custom block. Standardize one empty-state
partial; homepage especially needs one since filters frequently produce 0 hits.

### 3.6 🟠 Results count presentation varies
`<p class="results-count">` (sale/restocks/colors/stores/store_detail) vs `<h2>Active (n)</h2>`
(index/category) vs nothing (discontinued, color_products).

### 3.7 🟠 `escapeHtml` and SSE-listener JS duplicated in 5 views
`product.ejs`, `ai_search.ejs`, `ai_style.ejs`, `ai_deals.ejs` each carry a copy of `escapeHtml` and
nearly identical EventSource wiring. Extract a shared `ai-stream.js`.

### 3.8 🟠 Variant length "(REGULAR)" shown even when meaningless
Cards always render `Color (LENGTH)`; for the majority of products with a single REGULAR length it's
noise. The variant page already has `hasMultipleLengths` logic — apply the same idea to cards.

### 3.9 🟠 Thumbnail fallback applied inconsistently
Most listing queries use the two-step COALESCE fallback; `store_detail` (`main.ts:1282`) and the
`/colors` thumbnails don't, so those pages show more "No Image" placeholders than the rest (root
cause: 1.16).

### 3.10 🟠 Nav: no active state; theme button initial icon wrong
`.nav-links a.active` CSS exists but no view ever sets it — the current page is never highlighted.
The theme toggle shows 🌙 by default even when the system is in light mode (icon only set from
localStorage). Heart glyphs also differ (`&#x2665;` nav vs `&#x2764;` favorites heading).

### 3.11 🟠 Dead search infrastructure
`GET /api/search` (`main.ts:217`) is referenced by nothing, and `.quick-search*` CSS styles a search
box that doesn't exist in any view. Either wire up the navbar quick-search (nice win) or delete both.

### 3.12 🟠 `/products` rendered through `index.ejs` keyed on the title string
`title === 'All Products'` decides form action and pagination base URL (`index.ejs:69,196`). Fragile —
pass an explicit `baseUrl`/`mode` variable instead.

---

## 4. CSS issues

### 4.1 🔴 Conflicting duplicate definitions actively change rendering
- `.nav-links` (line 61) vs `.nav-links` (line 627, legacy header design): the later block overrides
  `gap: 4px → 20px`; `.nav-links a` (line 73) vs (line 633) overrides color/weight/size/padding of nav
  links. The nav is currently rendered by leftover styles from a removed header design.
- `.nav-sale-link` defined twice (line 455 `#d9534f` and line 1810 `#dc2626 !important`).
- `.product-card` defined three times (144, 1071, 1819); `.no-image-placeholder` twice (460, 1540);
  `.designers-notes`, `.product-attributes`, `.product-description` exist both globally and scoped.

### 4.2 🟡 ~20 dead class groups
`.header`, `.logo`, `.quick-search*`, `.footer*`, `.card-badge`, `.card-restock-badge`,
`.card-new-badge`, `.stars-small`, `.color-swatch*`, `.swatches-row*`, `.card-swatches`, `.filter-box`,
`.filter-label`, `.filter-select`, `.back-link`, `.variant-main-image`, `.color-family`,
`.sale-header`, `.sale-count`, `.empty-state-icon/title/text`, `.color-meta`, `.category-name`,
`.category-count`, `.stores-country`, `.store-name`, `.attribute-label/value`, `.product-title`,
`.product-subtitle` are unused in any view. ~30-40% of the stylesheet is dead or duplicated.

### 4.3 🟡 No design tokens
`light-dark(...)` literals are repeated hundreds of times with slightly different grays
(#eee/#e0e0e0/#ddd vs #333/#444). Define CSS custom properties (`--surface`, `--border`, `--text-muted`,
`--accent`, `--danger`, `--ai-accent`) once on `:root`.

---

## 5. Performance

- 🔴 **N+1 queries on `/colors`** — one thumbnail query per color row in a loop (`main.ts:938-950`).
- 🔴 **Unpaginated full-table pages** — `/products`, `/sale`, and `/discontinued` render every row;
  discontinued grows without bound over time.
- 🟡 **Duplicate stats queries per request** — every route calls `getLastScanTime` *and* `getStats`
  (which calls it again): 4 queries/request before any page data. Cache stats for ~30s or compute once
  in a middleware.
- 🟡 **Full-resolution BLOBs as grid thumbnails** — full-size JPEGs from SQLite serve 200px cards;
  `<img>` tags have no width/height (layout shift). Store/resize a thumbnail variant (e.g. `sharp` at
  scrape time) and add dimensions.
- 🟡 **No compression / static caching** — add `compression()` and `maxAge` for `/styles.css`.
- 🟡 **Puppeteer per-image download** — a full Chromium page per image (`scraper.ts:57-134`). The
  Cloudinary asset URL almost certainly serves to plain `fetch` with a UA header; that would remove
  the heaviest dependency, the 30s/image worst case, and most scrape time.
- 🟡 **`/colors` `GROUP BY` under `SELECT DISTINCT`** with non-aggregated `ref_color`, `swatch` —
  works in SQLite but indeterminate; drop the DISTINCT and pick deterministic aggregates.

---

## 6. Architecture / maintainability

- 🟡 `main.ts` is a 1,365-line monolith: split routes into modules (`routes/web.ts`, `routes/api.ts`),
  extract shared helpers (filter/WHERE builder, JSON-column hydration, `formatPrice`, stats middleware).
- 🟡 `any` everywhere on the read path — `types.ts` defines scraper types but no row types exist for
  queries; views receive untyped bags.
- 🟡 `db.ts` migrations are fire-and-forget inside `db.run` callbacks; `setupDatabase` can resolve
  before `ALTER TABLE`s finish, and errors are only logged. Sequence them properly (or adopt
  `better-sqlite3`, which would also remove all the promisify glue).
- 🟡 Error handling: no Express error middleware, no 404 page; route errors return Express 5's default
  HTML stack page. 404s are bare `res.status(404).send('Product not found')` — inconsistent with the
  styled site.
- 🟡 `restocks` page labels timestamp as `added_at_formatted`; `discontinued` aliases `p.name` as
  `product_name` while every other query uses `name` — small naming drift that forces per-view code.
- 🟡 `prepareRunAll` runs `UPDATE` statements for every product/variant on every scrape (~thousands of
  sequential statement runs every 30 min) even when nothing changed; could diff first or batch.

---

## 7. Suggested fix plan

**Phase 1 — visible bugs & safety (small, high impact)**
1.1 size filter quoting · 1.2 sale discount badge · 1.5 skeleton CSS · 1.6 shared favorites JS →
nav badge everywhere · 2.1/2.2 escaping + DOMPurify · 1.3 sort dropdown per page · 4.1 remove
conflicting CSS blocks · favicon · price formatting (3.3).

**Phase 2 — consistency refactor**
Shared head/foot partials + `app.js` (3.1, 3.7) · single product-card partial + JS renderer (3.2) ·
standardized empty states & result counts (3.5, 3.6) · nav active state (3.10) · wire up or remove
quick search (3.11) · explicit `baseUrl` instead of title matching (3.12) · CSS tokens + dead-rule
purge (4.2, 4.3).

**Phase 3 — data-layer robustness**
Scan-id based active/discontinued (1.10) · scrape mutex + protected update endpoint (1.11) · unified
timestamps (1.8) · store-availability swap (1.13) · images schema fix (1.16) · `getLastScanTime`
fallback (1.7).

**Phase 4 — performance & reach**
Pagination on /products, /sale, /discontinued · /colors N+1 · stats caching · thumbnails via sharp +
fetch-based image download · compression · broader scrape coverage (1.12).
