import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { parse as parseHTML } from 'node-html-parser';
import puppeteer, { Browser } from 'puppeteer';
import { logger } from '../logger';
import { RecipesService } from '../recipes/recipes.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import {
  OllamaClient,
  Message,
  JsonSchema,
  OllamaStreamChunk,
} from './ollama.client';

// JSON Schemas for structured output
const PARSED_RECIPE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    instructions: { type: 'string' },
    servings: { type: 'number' },
    prepTimeMinutes: { type: 'number' },
    cookTimeMinutes: { type: 'number' },
    source: { type: 'string' },
  },
  required: ['title', 'ingredients', 'instructions'],
};

const PARSED_INGREDIENTS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
  },
  required: ['ingredients'],
};

// Singleton browser instance (same pattern as aritzia-scanner)
let BROWSER: Browser | null = null;

async function getBrowser(): Promise<Browser> {
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

const SUGGESTION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['name', 'confidence'],
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['name', 'confidence'],
      },
    },
  },
  required: ['categories', 'tags'],
};

const COOKING_TIPS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    tips: {
      type: 'array',
      items: { type: 'string' },
    },
    commonMistakes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['tips', 'commonMistakes'],
};

const FLAVOR_PROFILE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    primaryFlavors: {
      type: 'array',
      items: { type: 'string' },
    },
    tasteProfile: { type: 'string' },
    pairingRecommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['primaryFlavors', 'tasteProfile', 'pairingRecommendations'],
};

export interface SuggestionItem {
  id: string;
  name: string;
  confidence: number;
}

export interface TagsAndCategoriesSuggestion {
  suggestedCategories: SuggestionItem[];
  suggestedTags: SuggestionItem[];
}

export interface ChatResponse {
  answer: string;
  messages: Message[];
}

export interface CookingTipsResponse {
  tips: string[];
  commonMistakes: string[];
}

export interface FlavorProfileResponse {
  primaryFlavors: string[];
  tasteProfile: string;
  pairingRecommendations: string[];
}

export interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
  instructions: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  source?: string;
  imageUrls?: string[];
}

interface OllamaSuggestionResponse {
  categories: Array<{ name: string; confidence: number }>;
  tags: Array<{ name: string; confidence: number }>;
}

export class AiService {
  private readonly _recipesService = inject(RecipesService);
  private readonly _categoriesService = inject(CategoriesService);
  private readonly _tagsService = inject(TagsService);
  private readonly _ollamaClient = new OllamaClient();

  /**
   * Suggest tags and categories for a recipe based on its content
   */
  async suggestTagsAndCategories(
    recipeId: string
  ): Promise<TagsAndCategoriesSuggestion> {
    // Get recipe details
    const recipe = await this._recipesService.getById(recipeId);

    // Get all available categories and tags
    const [categories, tags] = await Promise.all([
      this._categoriesService.getAll(),
      this._tagsService.getAll(),
    ]);

    // Build the prompt
    const prompt = this.buildPrompt(recipe, categories, tags);

    // Get AI suggestions
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a recipe classification assistant. Your task is to analyze recipes and suggest the most appropriate categories and tags from a given list. Always respond with valid JSON only, no additional text or explanation.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this._ollamaClient.chat(messages, {
      temperature: 0.3, // Lower temperature for more consistent classification
      format: SUGGESTION_SCHEMA,
    });

    // Parse the response
    const suggestions = this.parseResponse(response, categories, tags);

    return suggestions;
  }

  /**
   * Build the prompt for the AI model
   */
  private buildPrompt(
    recipe: {
      title: string;
      description?: string | null;
      instructions?: string | null;
      ingredients: Array<{ name: string }>;
    },
    categories: Array<{ id: string; name: string }>,
    tags: Array<{ id: string; name: string }>
  ): string {
    const ingredientsList = recipe.ingredients.map((i) => i.name).join(', ');

    const categoryNames = categories.map((c) => c.name).join(', ');
    const tagNames = tags.map((t) => t.name).join(', ');

    return `Analyze this recipe and suggest the most appropriate categories and tags.

RECIPE:
Title: ${recipe.title}
Description: ${recipe.description || 'No description'}
Ingredients: ${ingredientsList || 'No ingredients listed'}
Instructions: ${recipe.instructions || 'No instructions'}

AVAILABLE CATEGORIES (choose from these only):
${categoryNames || 'None available'}

AVAILABLE TAGS (choose from these only):
${tagNames || 'None available'}

Respond with a JSON object in this exact format:
{
  "categories": [{"name": "Category Name", "confidence": 0.95}],
  "tags": [{"name": "Tag Name", "confidence": 0.85}]
}

Rules:
- Only suggest categories and tags from the available lists above
- Confidence should be between 0.0 and 1.0
- Only include suggestions with confidence > 0.5
- Sort by confidence descending
- Maximum 3 categories and 5 tags`;
  }

  /**
   * Parse the AI response and map to IDs
   */
  private parseResponse(
    response: string,
    categories: Array<{ id: string; name: string }>,
    tags: Array<{ id: string; name: string }>
  ): TagsAndCategoriesSuggestion {
    const cleanedResponse = this.cleanJsonResponse(response);

    let parsed: OllamaSuggestionResponse;
    try {
      parsed = JSON.parse(cleanedResponse);
    } catch {
      // If parsing fails, return empty suggestions
      logger.error({ response }, 'Failed to parse AI suggestion response');
      return {
        suggestedCategories: [],
        suggestedTags: [],
      };
    }

    // Map category names to IDs
    const categoryMap = new Map(
      categories.map((c) => [c.name.toLowerCase(), c])
    );
    const suggestedCategories: SuggestionItem[] = (parsed.categories || [])
      .map((suggestion) => {
        const category = categoryMap.get(suggestion.name.toLowerCase());
        if (category && suggestion.confidence > 0.5) {
          return {
            id: category.id,
            name: category.name,
            confidence: Math.round(suggestion.confidence * 100) / 100,
          };
        }
        return null;
      })
      .filter((item): item is SuggestionItem => item !== null)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    // Map tag names to IDs
    const tagMap = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
    const suggestedTags: SuggestionItem[] = (parsed.tags || [])
      .map((suggestion) => {
        const tag = tagMap.get(suggestion.name.toLowerCase());
        if (tag && suggestion.confidence > 0.5) {
          return {
            id: tag.id,
            name: tag.name,
            confidence: Math.round(suggestion.confidence * 100) / 100,
          };
        }
        return null;
      })
      .filter((item): item is SuggestionItem => item !== null)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    return {
      suggestedCategories,
      suggestedTags,
    };
  }

  /**
   * Feature 8: Chat about a recipe - answer questions about a specific recipe
   */
  async chatAboutRecipe(
    recipeId: string,
    question: string,
    conversationHistory: Message[] = []
  ): Promise<ChatResponse> {
    const recipe = await this._recipesService.getById(recipeId);

    const recipeContext = this.buildRecipeContext(recipe);

    const systemPrompt = `You are a friendly and knowledgeable cooking assistant. You have access to the following recipe and will answer questions about it helpfully and accurately.

${recipeContext}

Guidelines:
- Be concise but thorough
- If asked about substitutions, provide alternatives with explanations
- If asked about techniques, explain them clearly for home cooks
- If the question is not related to this recipe or cooking, politely redirect
- Use a warm, encouraging tone`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: question },
    ];

    const answer = await this._ollamaClient.chat(messages, {
      temperature: 0.7,
    });

    // Build updated conversation history for follow-up questions
    const updatedMessages: Message[] = [
      ...conversationHistory,
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ];

    return {
      answer,
      messages: updatedMessages,
    };
  }

  /**
   * Stream chat about a recipe - yields tokens as they arrive from the LLM
   */
  async *chatAboutRecipeStream(
    recipeId: string,
    question: string,
    conversationHistory: Message[] = []
  ): AsyncGenerator<{ token: string; done: boolean }> {
    const recipe = await this._recipesService.getById(recipeId);
    const recipeContext = this.buildRecipeContext(recipe);

    const systemPrompt = `You are a friendly and knowledgeable cooking assistant. You have access to the following recipe and will answer questions about it helpfully and accurately.

${recipeContext}

Guidelines:
- Be concise but thorough
- If asked about substitutions, provide alternatives with explanations
- If asked about techniques, explain them clearly for home cooks
- If the question is not related to this recipe or cooking, politely redirect
- Use a warm, encouraging tone
- Use markdown formatting for better readability (bold, lists, etc.)`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: question },
    ];

    for await (const chunk of this._ollamaClient.chatStream(messages, {
      temperature: 0.7,
    })) {
      yield {
        token: chunk.message.content,
        done: chunk.done,
      };
    }
  }

  /**
   * Feature 9: Get cooking tips for a recipe
   */
  async getCookingTips(recipeId: string): Promise<CookingTipsResponse> {
    const recipe = await this._recipesService.getById(recipeId);

    const recipeContext = this.buildRecipeContext(recipe);

    const prompt = `Analyze this recipe and provide helpful cooking tips.

${recipeContext}

Provide your response as JSON in this exact format:
{
  "tips": ["tip 1", "tip 2", "tip 3"],
  "commonMistakes": ["mistake 1", "mistake 2", "mistake 3"]
}

Guidelines:
- Provide 3-5 practical tips specific to this recipe
- Include 2-4 common mistakes home cooks make with this type of dish
- Tips should be actionable and specific
- Focus on techniques, timing, and presentation`;

    const messages: Message[] = [
      {
        role: 'system',
        content:
          'You are an expert chef providing practical cooking advice. Always respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ];

    const response = await this._ollamaClient.chat(messages, {
      temperature: 0.5,
      format: COOKING_TIPS_SCHEMA,
    });

    return this.parseCookingTipsResponse(response);
  }

  /**
   * Parse recipe from a URL by fetching the page and extracting JSON-LD Recipe data
   */
  async parseRecipeFromUrl(url: string): Promise<ParsedRecipe> {
    logger.info({ url }, 'Parsing recipe from URL');
    const html = await this.fetchPageHtml(url);

    // Parse the HTML and look for JSON-LD Recipe data
    const root = parseHTML(html);
    const jsonLdScripts = root.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    logger.debug(
      { url, jsonLdBlockCount: jsonLdScripts.length },
      'Found JSON-LD blocks'
    );

    let recipeData: any = null;

    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        recipeData = this.findRecipeInJsonLd(data);
        if (recipeData) break;
      } catch {
        // Skip malformed JSON-LD blocks
      }
    }

    if (!recipeData) {
      logger.warn(
        { url },
        'No JSON-LD recipe data found, falling back to content extraction + LLM'
      );

      // Fallback: extract readable content from the page and use LLM to parse
      const recipeText = this.extractRecipeContent(root);
      if (!recipeText || recipeText.length < 50) {
        throw HttpErrors.UnprocessableEntity(
          'Could not find recipe content on this page. Try copying and pasting the recipe text instead.'
        );
      }

      logger.info(
        { url, contentLength: recipeText.length },
        'Extracted page content, sending to LLM for parsing'
      );
      const parsed = await this.parseRecipeFromText(recipeText);
      // Attach source URL if not already set
      if (!parsed.source) {
        parsed.source = url;
      }
      // Extract images from the HTML for the LLM fallback path
      const imageUrls = this.extractImageUrlsFromHtml(root, url);
      if (imageUrls.length > 0) {
        parsed.imageUrls = imageUrls;
      }
      return parsed;
    }

    // Map schema.org Recipe to our format
    logger.info(
      { url, recipeName: recipeData.name },
      'Extracted recipe from JSON-LD'
    );
    return this.mapJsonLdToRecipe(recipeData, url);
  }

  /**
   * Fetch page HTML, trying plain fetch first, falling back to puppeteer
   * for sites protected by Cloudflare or similar bot-detection services.
   */
  private async fetchPageHtml(url: string): Promise<string> {
    // Try simple fetch first (fast, works for most sites)
    logger.debug({ url }, 'Fetching page HTML');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        logger.debug({ url, status: response.status }, 'Fetch succeeded');
        return await response.text();
      }

      // If blocked (403/503), fall through to puppeteer
      if (response.status !== 403 && response.status !== 503) {
        throw new Error(`HTTP ${response.status}`);
      }

      logger.info(
        { url, status: response.status },
        'Fetch blocked, retrying with puppeteer'
      );
    } catch (error) {
      // If it's a non-blocking error (timeout, network), throw immediately
      if (
        error instanceof Error &&
        !error.message.includes('403') &&
        !error.message.includes('503')
      ) {
        throw HttpErrors.BadGateway(`Failed to fetch URL: ${error.message}`);
      }
    }

    // Fallback: use puppeteer to render the page like a real browser
    // Uses singleton browser instance (same approach as aritzia-scanner)
    let page;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();

      // Set a common user agent to help mimic a regular browser
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      const html = await page.content();
      logger.info(
        { url, htmlLength: html.length },
        'Puppeteer fetch succeeded'
      );
      return html;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { url, err: error instanceof Error ? error : undefined },
        'Puppeteer fetch failed'
      );
      throw HttpErrors.BadGateway(
        `Failed to fetch URL with browser fallback: ${msg}`
      );
    } finally {
      await page?.close();
    }
  }

  /**
   * Recursively search a JSON-LD structure for a Recipe object
   */
  private findRecipeInJsonLd(data: any): any | null {
    if (!data) return null;

    // Direct Recipe object
    if (data['@type'] === 'Recipe') return data;

    // Array of types (e.g. ["Recipe", "Thing"])
    if (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))
      return data;

    // @graph array (common pattern)
    if (data['@graph'] && Array.isArray(data['@graph'])) {
      for (const item of data['@graph']) {
        const found = this.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }

    // Top-level array
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = this.findRecipeInJsonLd(item);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Extract readable recipe content from parsed HTML.
   * Tries common recipe plugin selectors first, then falls back to
   * stripping boilerplate and extracting the main content area.
   */
  private extractRecipeContent(root: ReturnType<typeof parseHTML>): string {
    // Common CSS selectors used by popular WordPress recipe plugins and themes
    const recipeSelectors = [
      // WP Recipe Maker (WPRM) — most popular plugin
      '.wprm-recipe-container',
      '.wprm-recipe',
      // Tasty Recipes
      '.tasty-recipes',
      '.tasty-recipe',
      // Recipe Card Blocks (by developer theme)
      '.recipe-card',
      '.recipe-card-block',
      // Zip Recipes
      '.zip-recipe-plugin',
      // EasyRecipe
      '.easyrecipe',
      // Yummly / Yumprint
      '.yumprint-recipe',
      // Generic recipe schema markup patterns
      '[itemtype*="schema.org/Recipe"]',
      '[itemtype*="Recipe"]',
      // Common class patterns
      '.recipe-content',
      '.recipe',
      '.recipe-box',
      '.recipe-block',
      '.entry-content .recipe',
    ];

    // Try each selector to find a dedicated recipe block
    for (const selector of recipeSelectors) {
      const el = root.querySelector(selector);
      if (el) {
        const text = this.htmlToCleanText(el);
        if (text.length > 100) {
          logger.debug(
            { selector, textLength: text.length },
            'Found recipe content via CSS selector'
          );
          return text;
        }
      }
    }

    // Fallback: extract from main content area after stripping boilerplate
    logger.debug('No recipe selector matched, extracting main content');

    // Remove known boilerplate elements
    const boilerplateSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.sidebar',
      '#sidebar',
      'aside',
      '.comments',
      '#comments',
      '.comment-form',
      '.comment-respond',
      '.widget',
      '.advertisement',
      '.ad',
      '.social-share',
      '.share-buttons',
      '.related-posts',
      '.post-navigation',
      '.breadcrumbs',
      '.site-footer',
      '.site-header',
      'noscript',
      'iframe',
    ];

    for (const selector of boilerplateSelectors) {
      root.querySelectorAll(selector).forEach((el) => el.remove());
    }

    // Try common main content containers
    const contentSelectors = [
      'article',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.content-area',
      'main',
      '[role="main"]',
      '.post',
    ];

    for (const selector of contentSelectors) {
      const el = root.querySelector(selector);
      if (el) {
        const text = this.htmlToCleanText(el);
        if (text.length > 200) {
          logger.debug(
            { selector, textLength: text.length },
            'Extracted content from main area'
          );
          // Truncate to avoid hitting LLM token limits — 15k chars is plenty for a recipe
          return text.slice(0, 15000);
        }
      }
    }

    // Last resort: body text
    const bodyText = this.htmlToCleanText(root);
    return bodyText.slice(0, 15000);
  }

  /**
   * Convert an HTML element to clean readable text.
   * Preserves basic structure (headings, list items, paragraphs)
   * while stripping all markup.
   */
  private htmlToCleanText(element: ReturnType<typeof parseHTML>): string {
    // Get text content, but try to preserve some structure
    let html = element.innerHTML;

    // Replace block-level elements with newlines to preserve structure
    html = html.replace(/<\/?(h[1-6]|p|div|li|tr|br\s*\/?)[^>]*>/gi, '\n');
    // Replace list markers
    html = html.replace(/<\/?[uo]l[^>]*>/gi, '\n');

    // Strip remaining HTML tags
    html = html.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    html = html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#8217;/g, "'")
      .replace(/&#8211;/g, '–')
      .replace(/&#8212;/g, '—')
      .replace(/&frac12;/g, '1/2')
      .replace(/&frac13;/g, '1/3')
      .replace(/&frac14;/g, '1/4')
      .replace(/&frac34;/g, '3/4');

    // Collapse whitespace: multiple spaces → single, multiple newlines → double
    html = html.replace(/[ \t]+/g, ' ');
    html = html.replace(/\n[ \t]*/g, '\n');
    html = html.replace(/\n{3,}/g, '\n\n');

    return html.trim();
  }

  /**
   * Map a schema.org Recipe JSON-LD object to our ParsedRecipe format
   */
  private async mapJsonLdToRecipe(
    data: any,
    sourceUrl: string
  ): Promise<ParsedRecipe> {
    const title = data.name || 'Untitled Recipe';

    // Description: use only if it's a genuine summary, not ingredient list
    let description: string | undefined;
    if (data.description && typeof data.description === 'string') {
      const trimmed = data.description.trim();
      // Skip if it looks like an ingredient list (lots of commas/newlines with short fragments)
      if (trimmed.length > 0 && trimmed.length < 2000) {
        description = trimmed;
      }
    }

    // Parse instructions
    let instructions = '';
    if (typeof data.recipeInstructions === 'string') {
      instructions = data.recipeInstructions;
    } else if (Array.isArray(data.recipeInstructions)) {
      instructions = data.recipeInstructions
        .map((step: any, idx: number) => {
          if (typeof step === 'string') return `${idx + 1}. ${step}`;
          if (step.text) return `${idx + 1}. ${step.text}`;
          // HowToSection with itemListElement
          if (step['@type'] === 'HowToSection' && step.itemListElement) {
            const sectionSteps = step.itemListElement
              .map((s: any, i: number) =>
                typeof s === 'string' ? s : s.text || ''
              )
              .filter(Boolean);
            const header = step.name ? `**${step.name}**\n` : '';
            return (
              header +
              sectionSteps
                .map((s: string, i: number) => `${idx + i + 1}. ${s}`)
                .join('\n')
            );
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    // Strip HTML tags from instructions (ensure clean markdown)
    instructions = instructions.replace(/<[^>]+>/g, '');

    // Remove HelloFresh-style doubled-up portions: "1 tbsp (2 tbsp)" → "1 tbsp"
    instructions = this.removeDoubledPortions(instructions);

    // Parse servings from recipeYield
    let servings: number | undefined;
    if (data.recipeYield) {
      const yieldVal = Array.isArray(data.recipeYield)
        ? data.recipeYield[0]
        : data.recipeYield;
      const num = parseInt(String(yieldVal), 10);
      if (!isNaN(num)) servings = num;
    }

    // Parse ISO 8601 durations (PT20M, PT1H30M, etc.)
    const prepTimeMinutes = this.parseIsoDuration(data.prepTime);
    const cookTimeMinutes = this.parseIsoDuration(data.cookTime);

    // Extract image URLs from JSON-LD
    const imageUrls = this.extractImageUrls(data, sourceUrl);

    // Parse ingredients using LLM (schema.org gives strings like "1 cup butter, softened")
    let ingredients: ParsedRecipe['ingredients'] = [];
    if (
      Array.isArray(data.recipeIngredient) &&
      data.recipeIngredient.length > 0
    ) {
      try {
        ingredients = await this.parseIngredientStrings(data.recipeIngredient);
      } catch (error) {
        logger.warn(
          {
            err: error instanceof Error ? error : undefined,
            ingredientCount: data.recipeIngredient.length,
          },
          'LLM ingredient parsing failed, using raw strings as fallback'
        );
        // Fallback: use raw ingredient strings as names
        ingredients = data.recipeIngredient.map((s: string) => ({
          name: s,
          quantity: 1,
          unit: '',
        }));
      }
    }

    return {
      title,
      description,
      ingredients,
      instructions,
      servings,
      prepTimeMinutes,
      cookTimeMinutes,
      source: sourceUrl,
      ...(imageUrls.length > 0 && { imageUrls }),
    };
  }

  /**
   * Parse ISO 8601 duration string (e.g. "PT1H30M") to minutes
   */
  private parseIsoDuration(duration: string | undefined): number | undefined {
    if (!duration || typeof duration !== 'string') return undefined;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return undefined;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const total = hours * 60 + minutes;
    return total > 0 ? total : undefined;
  }

  /**
   * Extract image URLs from JSON-LD Recipe data.
   * The `image` field can be a string, array of strings, or ImageObject.
   */
  private extractImageUrls(data: any, sourceUrl: string): string[] {
    const urls: string[] = [];

    if (!data.image) return urls;

    const resolveUrl = (u: string): string => {
      try {
        return new URL(u, sourceUrl).href;
      } catch {
        return u;
      }
    };

    const processImage = (img: any) => {
      if (typeof img === 'string') {
        urls.push(resolveUrl(img));
      } else if (img && typeof img === 'object') {
        // ImageObject
        if (img.url) urls.push(resolveUrl(img.url));
        else if (img.contentUrl) urls.push(resolveUrl(img.contentUrl));
      }
    };

    if (Array.isArray(data.image)) {
      data.image.forEach(processImage);
    } else {
      processImage(data.image);
    }

    // Deduplicate
    return [...new Set(urls)];
  }

  /**
   * Extract likely recipe/food images from parsed HTML.
   * Looks at img tags in recipe containers and main content,
   * filtering out icons, logos, and tiny images.
   */
  private extractImageUrlsFromHtml(
    root: ReturnType<typeof parseHTML>,
    baseUrl: string
  ): string[] {
    const urls: string[] = [];

    const resolveUrl = (u: string): string => {
      try {
        return new URL(u, baseUrl).href;
      } catch {
        return u;
      }
    };

    // Skip patterns — icons, logos, avatars, tracking pixels, social media, ads
    const skipPatterns =
      /logo|icon|avatar|gravatar|sprite|badge|button|share|social|pinterest|facebook|twitter|instagram|ad[-_]|ads\/|advertisement|pixel|tracking|spacer|emoji|smiley|wp-includes/i;

    const isLikelyRecipeImage = (src: string, alt: string): boolean => {
      if (!src || skipPatterns.test(src) || skipPatterns.test(alt))
        return false;
      // Skip data URIs and SVGs
      if (src.startsWith('data:') || src.endsWith('.svg')) return false;
      // Skip tiny placeholder files
      if (/1x1|blank\.|placeholder/i.test(src)) return false;
      return true;
    };

    // Try recipe containers first for higher quality images
    const recipeContainerSelectors = [
      '.wprm-recipe-container',
      '.wprm-recipe',
      '.tasty-recipes',
      '.recipe-card',
      '[itemtype*="schema.org/Recipe"]',
      '.recipe-content',
      '.recipe',
    ];

    for (const selector of recipeContainerSelectors) {
      const container = root.querySelector(selector);
      if (container) {
        container.querySelectorAll('img').forEach((img) => {
          const src =
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('src') ||
            '';
          const alt = img.getAttribute('alt') || '';
          if (isLikelyRecipeImage(src, alt)) {
            urls.push(resolveUrl(src));
          }
        });
        if (urls.length > 0) {
          logger.debug(
            { count: urls.length },
            'Extracted images from recipe container'
          );
          return [...new Set(urls)].slice(0, 5);
        }
      }
    }

    // Fallback: look in main content area
    const contentSelectors = [
      'article',
      '.entry-content',
      '.post-content',
      'main',
      '[role="main"]',
    ];

    for (const selector of contentSelectors) {
      const container = root.querySelector(selector);
      if (container) {
        container.querySelectorAll('img').forEach((img) => {
          const src =
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('src') ||
            '';
          const alt = img.getAttribute('alt') || '';
          // For main content, also check image dimensions if available
          const width = parseInt(img.getAttribute('width') || '0', 10);
          const height = parseInt(img.getAttribute('height') || '0', 10);
          // Skip small images (likely icons/decorations)
          if (width > 0 && width < 100) return;
          if (height > 0 && height < 100) return;
          if (isLikelyRecipeImage(src, alt)) {
            urls.push(resolveUrl(src));
          }
        });
        if (urls.length > 0) break;
      }
    }

    // Limit to 5 images max
    const deduped = [...new Set(urls)].slice(0, 5);
    if (deduped.length > 0) {
      logger.debug(
        { count: deduped.length },
        'Extracted images from main content'
      );
    }
    return deduped;
  }

  /**
   * Remove HelloFresh-style doubled-up portion amounts from text.
   * e.g. "1 tbsp (2 tbsp) oil" → "1 tbsp oil"
   * e.g. "½ cup (1 cup) water" → "½ cup water"
   */
  private removeDoubledPortions(text: string): string {
    // Match patterns like "(2 tbsp)" or "(1 cup)" after a quantity+unit
    return text.replace(
      /(\d+[\s\/\u00BC-\u00BE\u2150-\u215E]*(?:tbsp|tsp|cup|oz|ml|g|lb|kg|teaspoon|tablespoon|ounce|pound|gram|kilogram|liter|litre|pinch|dash)s?)\s*\(\s*\d+[\s\/\u00BC-\u00BE\u2150-\u215E]*(?:tbsp|tsp|cup|oz|ml|g|lb|kg|teaspoon|tablespoon|ounce|pound|gram|kilogram|liter|litre|pinch|dash)s?\s*\)/gi,
      '$1'
    );
  }

  /**
   * Use LLM to parse ingredient strings into structured objects.
   * Strings like "1 cup butter, softened" → { quantity: 1, unit: "cup", name: "butter", notes: "softened" }
   */
  private async parseIngredientStrings(
    ingredientStrings: string[]
  ): Promise<ParsedRecipe['ingredients']> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `/no_think You are an ingredient parsing expert. Parse each ingredient string into structured data.

CRITICAL FIELD DEFINITIONS:
- "name": The ingredient itself (e.g. "butter", "all-purpose flour", "brown sugar", "chicken breast"). This is the name of the INGREDIENT, NOT the recipe title.
- "quantity": The numeric amount as a decimal (1/2 = 0.5, 1 1/2 = 1.5). Use 1 if no quantity given.
- "unit": The unit of measurement (e.g. "cup", "teaspoon", "tablespoon", "lb", "oz"). Use "" (empty string) for items counted individually (e.g. "2 large eggs" → unit: "").
- "notes": OPTIONAL preparation details, descriptors, or alternatives (e.g. "softened", "finely diced", "room temperature", "packed", "or substitute butter"). Only include if present.

HELLOFRESH / MEAL KIT RULES:
- Ingredients may include doubled-up portions in parentheses like "1 tbsp (2 tbsp)" — always use ONLY the base amount (before parentheses)
- Ignore any text like "(Double for 4 servings)" or similar scaling notes

Examples:
- "1 cup butter, softened" → { quantity: 1, unit: "cup", name: "butter", notes: "softened" }
- "2 large eggs" → { quantity: 2, unit: "", name: "eggs", notes: "large" }
- "3 cups all-purpose flour" → { quantity: 3, unit: "cup", name: "all-purpose flour" }
- "1 cup packed brown sugar" → { quantity: 1, unit: "cup", name: "brown sugar", notes: "packed" }
- "½ teaspoon salt" → { quantity: 0.5, unit: "teaspoon", name: "salt" }
- "1 cup chopped walnuts" → { quantity: 1, unit: "cup", name: "walnuts", notes: "chopped" }
- "1 tbsp (2 tbsp) olive oil" → { quantity: 1, unit: "tbsp", name: "olive oil" }`,
      },
      {
        role: 'user',
        content: `Parse these ingredient strings:\n${ingredientStrings
          .map((s, i) => `${i + 1}. ${s}`)
          .join('\n')}`,
      },
    ];

    const response = await this._ollamaClient.chat(messages, {
      temperature: 0.1,
      timeoutMs: 60000,
      format: PARSED_INGREDIENTS_SCHEMA,
    });

    const cleaned = this.cleanJsonResponse(response);
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.ingredients)) {
        return parsed.ingredients.map((ing: any) => ({
          name: ing.name || '',
          quantity: Number(ing.quantity) || 1,
          unit: ing.unit || '',
          notes: ing.notes || undefined,
        }));
      }
    } catch {
      logger.error({ response }, 'Failed to parse ingredient strings with LLM');
    }

    // Fallback: basic parsing without LLM
    return ingredientStrings.map((s) => ({
      name: s,
      quantity: 1,
      unit: '',
    }));
  }

  /**
   * Feature 14: Parse recipe from pasted text/webpage content
   */
  async parseRecipeFromText(rawText: string): Promise<ParsedRecipe> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `/no_think You are a recipe parsing expert. Your ONLY task is to extract structured data from the recipe text provided by the user. 

CRITICAL RULES:
- Extract ONLY information that exists in the provided text
- Do NOT invent or hallucinate any ingredients, instructions, or details
- Parse ingredient quantities as decimals (1/2 = 0.5, 1 1/2 = 1.5)
- If information is not present, omit the field

DESCRIPTION RULES:
- The description should be a brief 1-2 sentence summary of the dish
- If no clear description exists, leave it blank/empty — do NOT fabricate one
- The description must NEVER list ingredients — that belongs only in the ingredients array

INSTRUCTION RULES:
- Format instructions as clean markdown with a numbered list (1. Step one\n2. Step two)
- Instructions must be plain markdown text — no HTML tags
- If the source has numbered steps, preserve the ordering
- HelloFresh and similar meal kit recipes often include doubled portions in parentheses like "1 tbsp (2 tbsp) oil" or "½ cup (1 cup) water" — REMOVE the parenthesized doubled-up amount entirely, keeping only the base single-serving amount

CRITICAL INGREDIENT FIELD DEFINITIONS:
- "name": The ingredient itself (e.g. "butter", "all-purpose flour", "chicken breast"). This is the INGREDIENT name, NOT the recipe title.
- "quantity": Numeric amount as a decimal.
- "unit": Unit of measurement ("cup", "teaspoon", etc.). Use empty string for individually counted items.
- "notes": OPTIONAL preparation details or descriptors (e.g. "softened", "diced", "room temperature"). Only include if present.
- For HelloFresh-style doubled amounts like "1 tbsp (2 tbsp)", use only the base amount (1 tbsp).`,
      },
      {
        role: 'user',
        content: `Parse this recipe and extract the title, description, ingredients, instructions, servings, prep time, and cook time:

${rawText}`,
      },
    ];

    const response = await this._ollamaClient.chat(messages, {
      temperature: 0.1, // Very low temperature for accurate extraction
      timeoutMs: 180000, // 3 minutes for longer texts
      format: PARSED_RECIPE_SCHEMA,
    });

    return this.parseRecipeResponse(response);
  }

  /**
   * Feature 16: Analyze flavor profile of a recipe
   */
  async analyzeFlavorProfile(recipeId: string): Promise<FlavorProfileResponse> {
    const recipe = await this._recipesService.getById(recipeId);

    const recipeContext = this.buildRecipeContext(recipe);

    const prompt = `Analyze the flavor profile of this recipe.

${recipeContext}

Provide your response as JSON in this exact format:
{
  "primaryFlavors": ["savory", "umami", "slightly sweet"],
  "tasteProfile": "A rich, comforting dish with deep umami notes from the mushrooms, balanced by the subtle sweetness of caramelized onions. The fresh herbs add brightness...",
  "pairingRecommendations": ["A medium-bodied red wine like Pinot Noir", "Crusty sourdough bread", "A light arugula salad with lemon dressing"]
}

Guidelines:
- Identify 3-5 primary flavor characteristics (e.g., sweet, salty, sour, bitter, umami, spicy, smoky, tangy, rich, light, fresh, earthy)
- Write a 2-3 sentence description of the overall taste experience
- Suggest 2-4 food/drink pairings that complement the dish`;

    const messages: Message[] = [
      {
        role: 'system',
        content:
          'You are a culinary expert with refined taste. Analyze dishes like a food critic or sommelier. Always respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ];

    const response = await this._ollamaClient.chat(messages, {
      temperature: 0.6,
      format: FLAVOR_PROFILE_SCHEMA,
    });

    return this.parseFlavorProfileResponse(response);
  }

  /**
   * Build a text representation of a recipe for AI context
   */
  private buildRecipeContext(recipe: {
    title: string;
    description?: string | null;
    instructions?: string | null;
    servings: number;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    ingredients: Array<{
      name: string;
      quantity: number;
      unit: string;
      notes?: string | null;
    }>;
    categories?: Array<{ name: string }>;
    tags?: Array<{ name: string }>;
  }): string {
    const ingredientsList = recipe.ingredients
      .map(
        (i) =>
          `- ${i.quantity} ${i.unit} ${i.name}${i.notes ? ` (${i.notes})` : ''}`
      )
      .join('\n');

    const categories =
      recipe.categories?.map((c) => c.name).join(', ') || 'None';
    const tags = recipe.tags?.map((t) => t.name).join(', ') || 'None';

    return `RECIPE: ${recipe.title}

Description: ${recipe.description || 'No description'}
Servings: ${recipe.servings}
Prep Time: ${
      recipe.prepTimeMinutes
        ? `${recipe.prepTimeMinutes} minutes`
        : 'Not specified'
    }
Cook Time: ${
      recipe.cookTimeMinutes
        ? `${recipe.cookTimeMinutes} minutes`
        : 'Not specified'
    }
Categories: ${categories}
Tags: ${tags}

INGREDIENTS:
${ingredientsList || 'No ingredients listed'}

INSTRUCTIONS:
${recipe.instructions || 'No instructions provided'}`;
  }

  /**
   * Parse cooking tips response
   */
  private parseCookingTipsResponse(response: string): CookingTipsResponse {
    const cleaned = this.cleanJsonResponse(response);
    try {
      const parsed = JSON.parse(cleaned);
      return {
        tips: Array.isArray(parsed.tips) ? parsed.tips : [],
        commonMistakes: Array.isArray(parsed.commonMistakes)
          ? parsed.commonMistakes
          : [],
      };
    } catch {
      logger.error({ response }, 'Failed to parse cooking tips response');
      return { tips: [], commonMistakes: [] };
    }
  }

  /**
   * Parse recipe from text response
   */
  private parseRecipeResponse(response: string): ParsedRecipe {
    const cleaned = this.cleanJsonResponse(response);
    try {
      const parsed = JSON.parse(cleaned);
      return {
        title: parsed.title || 'Untitled Recipe',
        description: parsed.description,
        ingredients: Array.isArray(parsed.ingredients)
          ? parsed.ingredients.map((ing: any) => ({
              name: ing.name || '',
              quantity: Number(ing.quantity) || 1,
              unit: ing.unit || '',
              notes: ing.notes,
            }))
          : [],
        instructions: parsed.instructions || '',
        servings: parsed.servings ? Number(parsed.servings) : undefined,
        prepTimeMinutes: parsed.prepTimeMinutes
          ? Number(parsed.prepTimeMinutes)
          : undefined,
        cookTimeMinutes: parsed.cookTimeMinutes
          ? Number(parsed.cookTimeMinutes)
          : undefined,
        source: parsed.source,
      };
    } catch {
      logger.error({ response }, 'Failed to parse recipe response');
      throw new Error('Failed to parse recipe from text');
    }
  }

  /**
   * Parse flavor profile response
   */
  private parseFlavorProfileResponse(response: string): FlavorProfileResponse {
    const cleaned = this.cleanJsonResponse(response);
    try {
      const parsed = JSON.parse(cleaned);
      return {
        primaryFlavors: Array.isArray(parsed.primaryFlavors)
          ? parsed.primaryFlavors
          : [],
        tasteProfile: parsed.tasteProfile || '',
        pairingRecommendations: Array.isArray(parsed.pairingRecommendations)
          ? parsed.pairingRecommendations
          : [],
      };
    } catch {
      logger.error({ response }, 'Failed to parse flavor profile response');
      return {
        primaryFlavors: [],
        tasteProfile: '',
        pairingRecommendations: [],
      };
    }
  }

  /**
   * Clean JSON response from markdown code blocks
   */
  private cleanJsonResponse(response: string): string {
    let cleaned = response.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }
}
