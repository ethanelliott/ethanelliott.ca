import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { RecipesService } from '../recipes/recipes.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { OllamaClient, Message, JsonSchema } from './ollama.client';

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
      console.error('Failed to parse AI response:', response);
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
- Format instructions as numbered steps in a single string
- If information is not present, omit the field`,
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
      console.error('Failed to parse cooking tips response:', response);
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
      console.error('Failed to parse recipe response:', response);
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
      console.error('Failed to parse flavor profile response:', response);
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
