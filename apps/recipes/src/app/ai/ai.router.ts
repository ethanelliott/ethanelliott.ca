import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AiService } from './ai.service';

// Response schemas
const SuggestionItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

const SuggestTagsAndCategoriesResponseSchema = z.object({
  suggestedCategories: z.array(SuggestionItemSchema),
  suggestedTags: z.array(SuggestionItemSchema),
});

// Chat schemas
const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const ChatRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(MessageSchema).optional().default([]),
});

const ChatResponseSchema = z.object({
  answer: z.string(),
  messages: z.array(MessageSchema),
});

// Cooking tips schemas
const CookingTipsResponseSchema = z.object({
  tips: z.array(z.string()),
  commonMistakes: z.array(z.string()),
});

// Flavor profile schemas
const FlavorProfileResponseSchema = z.object({
  primaryFlavors: z.array(z.string()),
  tasteProfile: z.string(),
  pairingRecommendations: z.array(z.string()),
});

// Recipe import schemas
const ParseRecipeRequestSchema = z.object({
  text: z.string().min(10).max(50000),
});

const ParsedIngredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  notes: z.string().optional(),
});

const ParsedRecipeResponseSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  ingredients: z.array(ParsedIngredientSchema),
  instructions: z.string(),
  servings: z.number().optional(),
  prepTimeMinutes: z.number().optional(),
  cookTimeMinutes: z.number().optional(),
  source: z.string().optional(),
});

export async function AiRouter(fastify: FastifyInstance) {
  const aiService = inject(AiService);

  // Suggest tags and categories for a recipe
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/suggest-tags/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        response: {
          200: SuggestTagsAndCategoriesResponseSchema,
        },
      },
    },
    async (request) => {
      return aiService.suggestTagsAndCategories(request.params.recipeId);
    }
  );

  // Chat about a recipe (Feature 8)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/chat/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        body: ChatRequestSchema,
        response: {
          200: ChatResponseSchema,
        },
      },
    },
    async (request) => {
      const { question, history } = request.body;
      return aiService.chatAboutRecipe(
        request.params.recipeId,
        question,
        history
      );
    }
  );

  // Streaming chat about a recipe (SSE)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/chat/:recipeId/stream',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        body: ChatRequestSchema,
      },
    },
    async (request, reply) => {
      const { question, history } = request.body;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        for await (const chunk of aiService.chatAboutRecipeStream(
          request.params.recipeId,
          question,
          history
        )) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write('data: [DONE]\n\n');
      } catch (error) {
        reply.raw.write(
          `data: ${JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
    }
  );

  // Get cooking tips for a recipe (Feature 9)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/cooking-tips/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        response: {
          200: CookingTipsResponseSchema,
        },
      },
    },
    async (request) => {
      return aiService.getCookingTips(request.params.recipeId);
    }
  );

  // Analyze flavor profile (Feature 16)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/flavor-profile/:recipeId',
    {
      schema: {
        params: z.object({
          recipeId: z.string().uuid(),
        }),
        response: {
          200: FlavorProfileResponseSchema,
        },
      },
    },
    async (request) => {
      return aiService.analyzeFlavorProfile(request.params.recipeId);
    }
  );

  // Parse recipe from text (Feature 14)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/parse-recipe',
    {
      schema: {
        body: ParseRecipeRequestSchema,
        response: {
          200: ParsedRecipeResponseSchema,
        },
      },
    },
    async (request) => {
      return aiService.parseRecipeFromText(request.body.text);
    }
  );

  // Parse recipe from URL (fetch + JSON-LD extraction)
  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/parse-recipe-url',
    {
      schema: {
        body: z.object({
          url: z.string().url().max(2000),
        }),
        response: {
          200: ParsedRecipeResponseSchema,
        },
      },
    },
    async (request) => {
      return aiService.parseRecipeFromUrl(request.body.url);
    }
  );
}
