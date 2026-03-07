import { createTool, getToolRegistry } from '../tool-registry';

/** ─── helpers ─────────────────────────────────────────────────── */

const LIBRE_TRANSLATE_URL = process.env['LIBRE_TRANSLATE_URL'];

/** ─── web_search ──────────────────────────────────────────────── */

const webSearch = createTool(
  {
    name: 'web_search',
    description:
      'Search the web using DuckDuckGo Instant Answer API. Returns top results without tracking.',
    category: 'research',
    tags: ['search', 'web', 'internet'],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: {
          type: 'number',
          description: 'Maximum results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  },
  async (params) => {
    const query = params.query as string;
    const maxResults = Math.min((params.max_results as number) || 5, 10);

    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'AI-Gateway/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok)
        return { success: false, error: `DDG API error: ${resp.status}` };
      const data = (await resp.json()) as any;

      const results: { title: string; url: string; snippet: string }[] = [];

      // Abstract (instant answer)
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || '',
          snippet: data.AbstractText,
        });
      }

      // Related topics
      for (const topic of data.RelatedTopics || []) {
        if (results.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
        // Nested topics
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (results.length >= maxResults) break;
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0] || sub.Text.substring(0, 60),
                url: sub.FirstURL,
                snippet: sub.Text,
              });
            }
          }
        }
      }

      // Answer (e.g. calculator)
      if (data.Answer && results.length === 0) {
        results.push({
          title: 'Instant Answer',
          url: '',
          snippet: data.Answer,
        });
      }

      return {
        success: true,
        data: {
          query,
          answer: data.Answer || null,
          results: results.slice(0, maxResults),
          source: 'DuckDuckGo',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Search failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── fetch_url ───────────────────────────────────────────────── */

const fetchUrl = createTool(
  {
    name: 'fetch_url',
    description:
      'Fetch a URL and return clean text content (HTML is stripped). More powerful than http_request for reading articles and pages.',
    category: 'research',
    tags: ['fetch', 'web', 'scrape'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        max_chars: {
          type: 'number',
          description: 'Maximum characters to return (default: 8000)',
        },
      },
      required: ['url'],
    },
  },
  async (params) => {
    const url = params.url as string;
    const maxChars = (params.max_chars as number) || 8000;

    try {
      new URL(url); // validate
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Gateway/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok)
        return {
          success: false,
          error: `HTTP ${resp.status}: ${resp.statusText}`,
        };

      const contentType = resp.headers.get('content-type') || '';
      let text = await resp.text();

      if (contentType.includes('application/json')) {
        // already clean
      } else {
        // Strip HTML tags
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s{3,}/g, '\n\n')
          .trim();
      }

      if (text.length > maxChars) {
        text = text.slice(0, maxChars) + '\n\n[... content truncated ...]';
      }

      return {
        success: true,
        data: { url, contentType, length: text.length, text },
      };
    } catch (err) {
      return {
        success: false,
        error: `Fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── wikipedia_lookup ────────────────────────────────────────── */

const wikipediaLookup = createTool(
  {
    name: 'wikipedia_lookup',
    description: 'Get a summary and key facts for any entity from Wikipedia.',
    category: 'research',
    tags: ['wikipedia', 'facts', 'knowledge'],
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic or entity name to look up',
        },
        language: {
          type: 'string',
          description: 'Wikipedia language code (default: "en")',
        },
      },
      required: ['topic'],
    },
  },
  async (params) => {
    const topic = params.topic as string;
    const lang = (params.language as string) || 'en';

    try {
      // Search first to get correct page title
      const searchUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        topic
      )}`;
      const resp = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'AI-Gateway/1.0 (contact: admin@ethanelliott.ca)',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (resp.status === 404) {
        return {
          success: false,
          error: `No Wikipedia article found for "${topic}"`,
        };
      }
      if (!resp.ok)
        return { success: false, error: `Wikipedia API error: ${resp.status}` };

      const data = (await resp.json()) as any;

      return {
        success: true,
        data: {
          title: data.title,
          description: data.description,
          summary: data.extract,
          url: data.content_urls?.desktop?.page,
          thumbnail: data.thumbnail?.source,
          type: data.type,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Wikipedia lookup failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── get_news ─────────────────────────────────────────────────── */

const getNews = createTool(
  {
    name: 'get_news',
    description:
      'Get recent news headlines via RSS feeds. No API key required.',
    category: 'research',
    tags: ['news', 'headlines'],
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'Topic to search news for (e.g. "technology", "sports", "AI"). Default: top headlines.',
        },
        max_items: {
          type: 'number',
          description: 'Number of articles to return (default: 5)',
        },
      },
    },
  },
  async (params) => {
    const topic = (params.topic as string) || '';
    const maxItems = Math.min((params.max_items as number) || 5, 15);

    const feedUrl = topic
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(
          topic
        )}&hl=en-US&gl=US&ceid=US:en`
      : 'https://feeds.bbci.co.uk/news/rss.xml';

    try {
      const resp = await fetch(feedUrl, {
        headers: { 'User-Agent': 'AI-Gateway/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok)
        return { success: false, error: `RSS fetch error: ${resp.status}` };
      const xml = await resp.text();

      // Parse RSS items
      const items: {
        title: string;
        link: string;
        pubDate: string;
        source: string;
      }[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while (
        (match = itemRegex.exec(xml)) !== null &&
        items.length < maxItems
      ) {
        const item = match[1];
        const title =
          (item.match(/<title><!\[CDATA\[([^\]]+)\]\]>/) ||
            item.match(/<title>([^<]+)</))?.[1]?.trim() ?? '';
        const link =
          (item.match(/<link>([^<]+)</) ||
            item.match(/<guid[^>]*>([^<]+)</))?.[1]?.trim() ?? '';
        const pubDate = item.match(/<pubDate>([^<]+)</)?.[1]?.trim() ?? '';
        const source =
          item.match(/<source[^>]*>([^<]+)<\/source>/)?.[1]?.trim() ?? '';
        if (title) items.push({ title, link, pubDate, source });
      }

      return {
        success: true,
        data: {
          topic: topic || 'top headlines',
          count: items.length,
          source: feedUrl,
          articles: items,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `News fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── fetch_rss_feed ────────────────────────────────────────────── */

const fetchRssFeed = createTool(
  {
    name: 'fetch_rss_feed',
    description:
      'Parse any RSS/Atom feed and return the latest items with titles and summaries.',
    category: 'research',
    tags: ['rss', 'feed', 'news'],
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'RSS or Atom feed URL' },
        max_items: {
          type: 'number',
          description: 'Number of items (default: 5)',
        },
      },
      required: ['url'],
    },
  },
  async (params) => {
    const feedUrl = params.url as string;
    const maxItems = Math.min((params.max_items as number) || 5, 20);

    try {
      const resp = await fetch(feedUrl, {
        headers: { 'User-Agent': 'AI-Gateway/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok)
        return { success: false, error: `Fetch error: ${resp.status}` };
      const xml = await resp.text();

      // Support both RSS <item> and Atom <entry>
      const itemPattern = /<(item|entry)>([\s\S]*?)<\/(item|entry)>/g;
      const items: {
        title: string;
        link: string;
        date: string;
        summary: string;
      }[] = [];

      let m;
      while ((m = itemPattern.exec(xml)) !== null && items.length < maxItems) {
        const block = m[2];
        const title =
          (block.match(/<title><!\[CDATA\[([^\]]+)\]\]>/) ||
            block.match(/<title>([^<]+)</))?.[1]?.trim() ?? '';
        const link =
          (block.match(/<link>([^<]+)</) ||
            block.match(/<link href="([^"]+)"/))?.[1]?.trim() ?? '';
        const date =
          (block.match(/<pubDate>([^<]+)</) ||
            block.match(/<updated>([^<]+)</))?.[1]?.trim() ?? '';
        const desc =
          (block.match(/<description><!\[CDATA\[([^\]]+)\]\]>/) ||
            block.match(/<description>([^<]+)</) ||
            block.match(/<summary[^>]*>([^<]+)</))?.[1]?.trim() ?? '';
        const summary = desc.replace(/<[^>]+>/g, '').substring(0, 300);
        if (title) items.push({ title, link, date, summary });
      }

      return {
        success: true,
        data: { feedUrl, count: items.length, items },
      };
    } catch (err) {
      return {
        success: false,
        error: `Feed fetch failed: ${err instanceof Error ? err.message : err}`,
      };
    }
  }
);

/** ─── define_word ───────────────────────────────────────────────── */

const defineWord = createTool(
  {
    name: 'define_word',
    description:
      'Get dictionary definition, etymology, and synonyms for an English word (Free Dictionary API).',
    category: 'research',
    tags: ['dictionary', 'language', 'definition'],
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'Word to define' },
      },
      required: ['word'],
    },
  },
  async (params) => {
    const word = (params.word as string).trim().toLowerCase();

    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
        word
      )}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (resp.status === 404) {
        return { success: false, error: `No definition found for "${word}"` };
      }
      if (!resp.ok)
        return {
          success: false,
          error: `Dictionary API error: ${resp.status}`,
        };

      const data = (await resp.json()) as any[];
      const entry = data[0];

      const definitions: {
        partOfSpeech: string;
        definition: string;
        example?: string;
      }[] = [];
      for (const meaning of entry?.meanings || []) {
        for (const def of meaning.definitions || []) {
          definitions.push({
            partOfSpeech: meaning.partOfSpeech,
            definition: def.definition,
            example: def.example,
          });
          if (definitions.length >= 5) break;
        }
        if (definitions.length >= 5) break;
      }

      const synonyms = (entry?.meanings || [])
        .flatMap((m: any) => m.synonyms || [])
        .slice(0, 10);

      const phonetics = entry?.phonetics?.find((p: any) => p.text)?.text;

      return {
        success: true,
        data: {
          word: entry?.word ?? word,
          phonetic: phonetics,
          definitions,
          synonyms,
          etymology: entry?.origin,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Definition lookup failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── translate_text ────────────────────────────────────────────── */

const translateText = createTool(
  {
    name: 'translate_text',
    description:
      'Translate text to another language via LibreTranslate (requires LIBRE_TRANSLATE_URL env var).',
    category: 'research',
    tags: ['translate', 'language'],
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to translate' },
        target_language: {
          type: 'string',
          description:
            'Target language code (e.g. "es", "fr", "de", "ja", "zh")',
        },
        source_language: {
          type: 'string',
          description: 'Source language code (default: "auto" for auto-detect)',
        },
      },
      required: ['text', 'target_language'],
    },
  },
  async (params) => {
    if (!LIBRE_TRANSLATE_URL) {
      return {
        success: false,
        error:
          'Translation not configured. Set LIBRE_TRANSLATE_URL env var pointing to a LibreTranslate instance.',
      };
    }

    try {
      const body = {
        q: params.text,
        source: (params.source_language as string) || 'auto',
        target: params.target_language,
        format: 'text',
      };
      const resp = await fetch(`${LIBRE_TRANSLATE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok)
        return {
          success: false,
          error: `LibreTranslate error: ${resp.status}`,
        };
      const data = (await resp.json()) as any;
      return {
        success: true,
        data: {
          original: params.text,
          translated: data.translatedText,
          sourceLanguage:
            data.detectedLanguage?.language ?? params.source_language ?? 'auto',
          targetLanguage: params.target_language,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Translation failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

/** ─── academic_search ───────────────────────────────────────────── */

const academicSearch = createTool(
  {
    name: 'academic_search',
    description:
      'Search for academic papers on a topic via Semantic Scholar (free API).',
    category: 'research',
    tags: ['academic', 'papers', 'research'],
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Research topic or paper title' },
        max_results: {
          type: 'number',
          description: 'Max results (default: 5)',
        },
        year_from: {
          type: 'number',
          description: 'Filter papers from this year onwards',
        },
      },
      required: ['query'],
    },
  },
  async (params) => {
    const query = params.query as string;
    const limit = Math.min((params.max_results as number) || 5, 10);
    const yearFilter = params.year_from ? `&year=${params.year_from}-` : '';

    try {
      const url =
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
          query
        )}` +
        `&limit=${limit}&fields=title,authors,year,abstract,url,citationCount${yearFilter}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'AI-Gateway/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok)
        return {
          success: false,
          error: `Semantic Scholar error: ${resp.status}`,
        };
      const data = (await resp.json()) as any;

      const papers = (data.data || []).map((p: any) => ({
        title: p.title,
        authors: (p.authors || []).map((a: any) => a.name).join(', '),
        year: p.year,
        citationCount: p.citationCount,
        abstract: p.abstract
          ? p.abstract.substring(0, 500) +
            (p.abstract.length > 500 ? '...' : '')
          : null,
        url: p.url,
      }));

      return {
        success: true,
        data: { query, total: data.total ?? papers.length, papers },
      };
    } catch (err) {
      return {
        success: false,
        error: `Academic search failed: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }
  }
);

// Register all research tools
const registry = getToolRegistry();
registry.register(webSearch);
registry.register(fetchUrl);
registry.register(wikipediaLookup);
registry.register(getNews);
registry.register(fetchRssFeed);
registry.register(defineWord);
registry.register(translateText);
registry.register(academicSearch);

export {
  webSearch,
  fetchUrl,
  wikipediaLookup,
  getNews,
  fetchRssFeed,
  defineWord,
  translateText,
  academicSearch,
};
