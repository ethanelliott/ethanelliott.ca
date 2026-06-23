/* Shared client-side behavior: favorites, theme, mobile nav, card rendering. */

const FAVORITES_KEY = 'aritzia_favorites';

function getFavorites() {
  try {
    const favs = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(favs) ? favs : [];
  } catch {
    return [];
  }
}

function setFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  updateFavCount();
}

function isFavorite(id) {
  return getFavorites().includes(String(id));
}

function toggleFavoriteId(id) {
  id = String(id);
  let favs = getFavorites();
  const nowFavorite = !favs.includes(id);
  if (nowFavorite) {
    favs.push(id);
  } else {
    favs = favs.filter((f) => f !== id);
  }
  setFavorites(favs);
  return nowFavorite;
}

function updateFavCount() {
  const badge = document.getElementById('fav-count');
  if (badge) {
    const count = getFavorites().length;
    badge.textContent = count > 0 ? String(count) : '';
  }
}

function applyFavoriteState(btn, favorited) {
  btn.innerHTML = favorited ? '♥' : '♡';
  btn.classList.toggle('favorited', favorited);
  btn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
  btn.title = favorited ? 'Remove from favorites' : 'Add to favorites';
}

/* ==================== "New to Me" tracking ==================== */

// High-water mark: the scan time this browser has acknowledged. Products added
// after it are "new to me". Baselined to the latest scan on first ever load so
// you start caught up rather than seeing the whole catalog.
const SEEN_KEY = 'aritzia_seen_until';

function getSeenUntil() {
  return localStorage.getItem(SEEN_KEY) || '';
}

function setSeenUntil(ts) {
  if (ts) localStorage.setItem(SEEN_KEY, ts);
}

async function updateNewCount() {
  const badge = document.getElementById('new-count');
  if (!badge) return;
  try {
    const resp = await fetch(
      '/api/new-count?since=' + encodeURIComponent(getSeenUntil())
    );
    const data = await resp.json();
    const count = data && data.count ? data.count : 0;
    badge.textContent = count > 0 ? String(count) : '';
  } catch {
    /* badge is best-effort */
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return '$' + num.toFixed(2);
}

/**
 * Render LLM/markdown HTML safely. marked does not sanitize, so DOMPurify
 * (loaded from CDN on AI pages) strips any embedded HTML/script. If the CDN
 * failed to load, fall back to plain text rather than raw HTML.
 */
function setSafeHTML(el, html) {
  if (window.DOMPurify) {
    el.innerHTML = DOMPurify.sanitize(html);
  } else {
    el.textContent = html;
  }
}

/**
 * Client-side mirror of views/partials/product_card.ejs. `card` fields:
 * href, name, thumbnail_id, price, list_price, pricePrefix, subtext,
 * metaText, favoriteId, discontinued, rating, review_count, sizes.
 */
function renderProductCard(card) {
  const discount =
    card.price && card.list_price && card.price < card.list_price
      ? Math.round((1 - card.price / card.list_price) * 100)
      : 0;

  let html = '<div class="product-card' + (card.discontinued ? ' discontinued' : '') + '">';

  if (discount > 0) {
    html += '<span class="discount-overlay">' + discount + '% OFF</span>';
  }

  if (card.favoriteId) {
    const favorited = isFavorite(card.favoriteId);
    html +=
      '<button class="favorite-btn' +
      (favorited ? ' favorited' : '') +
      '" data-id="' +
      escapeHtml(card.favoriteId) +
      '" aria-pressed="' +
      (favorited ? 'true' : 'false') +
      '" title="' +
      (favorited ? 'Remove from favorites' : 'Add to favorites') +
      '">' +
      (favorited ? '♥' : '♡') +
      '</button>';
  }

  html += '<a href="' + escapeHtml(card.href) + '" class="product-image">';
  if (card.thumbnail_id) {
    html +=
      '<img src="/api/images/' +
      encodeURIComponent(card.thumbnail_id) +
      '" alt="' +
      escapeHtml(card.name) +
      '" loading="lazy" decoding="async" />';
  } else {
    html += '<span class="no-image-placeholder">No Image</span>';
  }
  html += '</a>';

  html += '<div class="product-info">';
  html +=
    '<a href="' +
    escapeHtml(card.href) +
    '" class="product-name">' +
    escapeHtml(card.name) +
    '</a>';

  if (card.price !== null && card.price !== undefined) {
    html += '<div class="product-price-container">';
    if (card.list_price && card.price < card.list_price) {
      html +=
        '<span class="price-sale">' +
        fmtPrice(card.price) +
        '</span> <span class="price-list">' +
        fmtPrice(card.list_price) +
        '</span>';
    } else {
      html +=
        '<span>' + escapeHtml(card.pricePrefix || '') + fmtPrice(card.price) + '</span>';
    }
    html += '</div>';
  }

  if (card.subtext) {
    html += '<div class="variant-details">' + escapeHtml(card.subtext) + '</div>';
  }

  if (card.rating) {
    const rounded = Math.round(card.rating);
    html +=
      '<div class="card-rating"><span class="stars">' +
      '★'.repeat(rounded) +
      '☆'.repeat(Math.max(0, 5 - rounded)) +
      '</span> ' +
      Number(card.rating).toFixed(1);
    if (card.review_count) {
      html +=
        ' <span class="review-count">(' +
        Number(card.review_count).toLocaleString() +
        ')</span>';
    }
    html += '</div>';
  }

  if (Array.isArray(card.sizes)) {
    if (card.sizes.length > 0) {
      html += '<div class="sizes-mini">';
      card.sizes.forEach(function (size) {
        html +=
          '<span class="size-tag-mini available">' + escapeHtml(size) + '</span>';
      });
      html += '</div>';
      if (card.sizes.length <= 2) {
        html += '<div class="low-stock-warning">Low stock</div>';
      }
    } else {
      html += '<div class="out-of-stock">Out of stock online</div>';
    }
  }

  if (card.discontinued) {
    html += '<div class="discontinued-badge">Discontinued</div>';
  }

  if (card.metaText) {
    html += '<div class="product-meta">' + escapeHtml(card.metaText) + '</div>';
  }

  html += '</div></div>';
  return html;
}

/* ==================== Theme ==================== */

function currentScheme() {
  return (
    document.documentElement.style.colorScheme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light')
  );
}

function updateThemeToggleIcon() {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = currentScheme() === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const next = currentScheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.style.colorScheme = next;
  localStorage.setItem('theme', next);
  updateThemeToggleIcon();
}

/* ==================== Mobile nav ==================== */

function toggleMobileNav() {
  document.getElementById('nav-drawer').classList.toggle('nav-open');
  document.getElementById('nav-hamburger').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('visible');
  document.body.classList.toggle('nav-locked');
}

function closeMobileNav() {
  document.getElementById('nav-drawer').classList.remove('nav-open');
  document.getElementById('nav-hamburger').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('visible');
  document.body.classList.remove('nav-locked');
}

/* ==================== Wiring ==================== */

// Favorite buttons work on every page (server-rendered or injected later)
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.favorite-btn');
  if (!btn || !btn.dataset.id) return;
  e.preventDefault();
  const favorited = toggleFavoriteId(btn.dataset.id);
  applyFavoriteState(btn, favorited);
  if (typeof window.onFavoriteToggled === 'function') {
    window.onFavoriteToggled(btn.dataset.id, favorited);
  }
});

document.addEventListener('DOMContentLoaded', function () {
  updateFavCount();
  updateThemeToggleIcon();

  // Pin the "new to me" baseline the first time the app is opened, then keep
  // the nav badge in sync.
  if (!getSeenUntil() && window.ARITZIA_LAST_SCAN) {
    setSeenUntil(window.ARITZIA_LAST_SCAN);
  }
  updateNewCount();

  // Sync server-rendered favorite buttons with localStorage
  const favs = getFavorites();
  document.querySelectorAll('.favorite-btn[data-id]').forEach(function (btn) {
    applyFavoriteState(btn, favs.includes(btn.dataset.id));
  });

  // Highlight the current page in the nav
  document
    .querySelectorAll('.nav-links a, .nav-drawer a')
    .forEach(function (a) {
      const href = a.getAttribute('href');
      if (
        href === window.location.pathname ||
        (href !== '/' && window.location.pathname.startsWith(href + '/'))
      ) {
        a.classList.add('active');
      }
    });

  // Auto-close drawer when a link is tapped
  document.querySelectorAll('#nav-drawer a').forEach(function (a) {
    a.addEventListener('click', closeMobileNav);
  });

  // Filter selects submit on change; opt out with data-no-submit
  document
    .querySelectorAll('.filters-form select:not([data-no-submit])')
    .forEach(function (select) {
      select.addEventListener('change', function () {
        select.form && select.form.submit();
      });
    });
});
