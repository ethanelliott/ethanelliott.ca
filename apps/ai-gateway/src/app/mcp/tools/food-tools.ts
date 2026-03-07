import { createTool, getToolRegistry } from '../tool-registry';

const RECIPES_API_URL =
  process.env['RECIPES_API_URL'] || 'http://recipes.default.svc:3000';

async function recipesGet(path: string) {
  const resp = await fetch(`${RECIPES_API_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok)
    throw new Error(`Recipes API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/** ─── search_recipes ─────────────────────────────────────────────── */

const searchRecipes = createTool(
  {
    name: 'search_recipes',
    description: 'Search the recipe library by ingredient, cuisine, or tag.',
    category: 'food',
    tags: ['recipe', 'search', 'cooking'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (ingredient, dish name, cuisine, or tag)',
        },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  async (params) => {
    try {
      const data = await recipesGet(
        `/recipes?q=${encodeURIComponent(params.query as string)}&limit=${
          (params.limit as number) || 10
        }`
      );
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── get_recipe ──────────────────────────────────────────────────── */

const getRecipe = createTool(
  {
    name: 'get_recipe',
    description:
      'Get full recipe detail including ingredients, steps, and nutrition.',
    category: 'food',
    tags: ['recipe', 'cooking'],
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe ID' },
      },
      required: ['recipe_id'],
    },
  },
  async (params) => {
    try {
      const data = await recipesGet(`/recipes/${params.recipe_id}`);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── suggest_recipe_from_ingredients ──────────────────────────────── */

const suggestRecipeFromIngredients = createTool(
  {
    name: 'suggest_recipe_from_ingredients',
    description:
      'Suggest recipes based on available ingredients ("What can I make with chicken, lemon, garlic?").',
    category: 'food',
    tags: ['recipe', 'ingredients', 'suggestion'],
    parameters: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          description: 'List of available ingredients',
          items: { type: 'string', description: 'Ingredient' },
        },
        limit: { type: 'number', description: 'Max suggestions (default: 5)' },
      },
      required: ['ingredients'],
    },
  },
  async (params) => {
    const ingredients = params.ingredients as string[];
    try {
      const data = await recipesGet(
        `/recipes/suggest?ingredients=${encodeURIComponent(
          ingredients.join(',')
        )}&limit=${(params.limit as number) || 5}`
      );
      return { success: true, data };
    } catch (err) {
      // Fallback: simple search by first ingredient
      try {
        const fallback = await recipesGet(
          `/recipes?q=${encodeURIComponent(ingredients[0])}&limit=${
            (params.limit as number) || 5
          }`
        );
        return {
          success: true,
          data: {
            note: 'Ingredient-match endpoint not available; showing search results for primary ingredient.',
            ...fallback,
          },
        };
      } catch (err2) {
        return {
          success: false,
          error: err2 instanceof Error ? err2.message : String(err2),
        };
      }
    }
  }
);

/** ─── scale_recipe ──────────────────────────────────────────────────── */

const scaleRecipe = createTool(
  {
    name: 'scale_recipe',
    description:
      'Scale a recipe to a different serving size, recomputing all ingredient quantities.',
    category: 'food',
    tags: ['recipe', 'scaling'],
    parameters: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe ID to scale' },
        original_servings: {
          type: 'number',
          description: 'Original serving count',
        },
        desired_servings: {
          type: 'number',
          description: 'Desired serving count',
        },
      },
      required: ['recipe_id', 'original_servings', 'desired_servings'],
    },
  },
  async (params) => {
    try {
      const recipe = await recipesGet(`/recipes/${params.recipe_id}`);
      const factor =
        (params.desired_servings as number) /
        (params.original_servings as number);

      // Scale numeric quantities in ingredients
      const scaleIngredient = (ingredient: any) => {
        if (!ingredient) return ingredient;
        if (typeof ingredient === 'string') {
          return ingredient.replace(/(\d+(\.\d+)?)/g, (match) => {
            const n = parseFloat(match) * factor;
            return Number.isInteger(n) ? String(n) : n.toFixed(2);
          });
        }
        if (ingredient.quantity != null) {
          return { ...ingredient, quantity: ingredient.quantity * factor };
        }
        return ingredient;
      };

      const scaledIngredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map(scaleIngredient)
        : recipe.ingredients;

      return {
        success: true,
        data: {
          ...recipe,
          originalServings: params.original_servings,
          scaledServings: params.desired_servings,
          scaleFactor: factor,
          ingredients: scaledIngredients,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── lookup_ingredient_substitution ───────────────────────────────── */

const lookupIngredientSubstitution = createTool(
  {
    name: 'lookup_ingredient_substitution',
    description:
      '"I\'m out of X, what can I use instead?" — returns common ingredient substitutions.',
    category: 'food',
    tags: ['recipe', 'substitution', 'cooking'],
    parameters: {
      type: 'object',
      properties: {
        ingredient: {
          type: 'string',
          description: 'Ingredient you want to substitute',
        },
        context: {
          type: 'string',
          description:
            'Optional cooking context (e.g. "baking", "sauce", "for vegans")',
        },
      },
      required: ['ingredient'],
    },
  },
  async (params) => {
    const ingredient = (params.ingredient as string).toLowerCase();
    const context = params.context as string | undefined;

    // Common substitution map
    const substitutions: Record<string, string[]> = {
      butter: [
        'coconut oil (1:1)',
        'olive oil (¾ of amount)',
        'applesauce (baking, ½:1)',
        'margarine (1:1)',
      ],
      eggs: [
        'flax egg: 1 tbsp ground flaxseed + 3 tbsp water',
        'chia egg: 1 tbsp chia + 3 tbsp water',
        'silken tofu (¼ cup per egg)',
        'banana (½ ripe banana per egg for baking)',
      ],
      milk: [
        'almond milk (1:1)',
        'oat milk (1:1)',
        'soy milk (1:1)',
        'coconut milk (1:1, richer)',
      ],
      'all-purpose flour': [
        'whole wheat flour (1:1 in most cases)',
        'oat flour (1:1 by weight)',
        'almond flour (replace 25% of flour)',
        'gluten-free blend (1:1 with binder)',
      ],
      sugar: [
        'honey (¾ cup per 1 cup sugar, reduce other liquids by ¼ cup)',
        'maple syrup (¾ cup per 1 cup, reduce liquids)',
        'coconut sugar (1:1)',
        'stevia (check package ratio)',
      ],
      'heavy cream': [
        'coconut cream (1:1)',
        'half-and-half (1:1, less rich)',
        'evaporated milk (1:1)',
        'cashew cream (soaked cashews blended with water)',
      ],
      breadcrumbs: [
        'crushed crackers',
        'crushed cornflakes',
        'rolled oats',
        'panko (crispier)',
        'ground almonds',
      ],
      'lemon juice': [
        'lime juice (1:1)',
        'white wine vinegar (½:1)',
        'apple cider vinegar (½:1)',
      ],
      'sour cream': [
        'plain Greek yogurt (1:1)',
        'cream cheese thinned with milk',
        'coconut cream',
      ],
      vinegar: [
        'lemon or lime juice (1:1)',
        'white wine (2x amount)',
        'apple cider vinegar (1:1)',
      ],
    };

    const key = Object.keys(substitutions).find(
      (k) => ingredient.includes(k) || k.includes(ingredient)
    );
    const subs = key ? substitutions[key] : null;

    return {
      success: true,
      data: {
        ingredient,
        context,
        substitutions: subs || [
          `No pre-loaded substitutions for "${ingredient}". Ask the assistant directly for creative alternatives.`,
        ],
        note: subs
          ? 'Substitutions may slightly alter flavour or texture. Best results depend on cooking method and context.'
          : undefined,
      },
    };
  }
);

/** ─── get_cooking_technique ──────────────────────────────────────── */

const getCookingTechnique = createTool(
  {
    name: 'get_cooking_technique',
    description:
      'Get an explanation and tips for a cooking method or technique.',
    category: 'food',
    tags: ['cooking', 'technique', 'guide'],
    parameters: {
      type: 'object',
      properties: {
        technique: {
          type: 'string',
          description:
            'Cooking technique (e.g. "sous vide", "braising", "tempering chocolate")',
        },
      },
      required: ['technique'],
    },
  },
  async (params) => {
    const technique = params.technique as string;

    const techniques: Record<
      string,
      { description: string; tips: string[]; temp?: string; time?: string }
    > = {
      braising: {
        description:
          'Low-and-slow cooking in a small amount of liquid, covered, to tenderize tough cuts.',
        tips: [
          'Brown the meat first for Maillard crust flavour.',
          'Liquid should come halfway up the ingredient.',
          'Low oven (160–175°C / 325–350°F) or low stovetop.',
          'Collagen-rich cuts like chuck, short rib, and lamb shoulder benefit most.',
        ],
        temp: '160–175°C / 325–350°F',
        time: '2–4 hours',
      },
      sauteing: {
        description:
          'Quick cooking in a hot pan with a small amount of fat, with constant movement.',
        tips: [
          'Dry ingredients before adding to pan to avoid steaming.',
          'High heat, small batches — overcrowding drops pan temperature.',
          'Add garlic and aromatics last to avoid burning.',
        ],
        temp: 'High heat (190–230°C)',
      },
      'sous vide': {
        description:
          'Vacuum-sealed cooking in a precisely temperature-controlled water bath.',
        tips: [
          'Produces perfectly even doneness edge-to-edge.',
          'Follow time and temp tables carefully (e.g. steak 54°C for medium-rare).',
          'Always sear after cooking for crust and colour.',
          'Season inside the bag.',
        ],
        temp: 'Depends on target doneness (e.g. 54–57°C for beef)',
        time: '1–4 hours typical',
      },
      blanching: {
        description:
          'Brief boiling followed by immediate ice bath to stop cooking. Preserves colour and par-cooks.',
        tips: [
          'Use heavily salted boiling water.',
          'Ice bath must be ready before you start.',
          'Great for green vegetables like broccoli, green beans, asparagus.',
        ],
        time: '30 seconds–3 minutes',
      },
      roasting: {
        description:
          'Dry-heat cooking in an oven at moderate-high temperature, uncovered.',
        tips: [
          'Pat meat dry before roasting for better browning.',
          'Use a wire rack so air circulates underneath.',
          'Rest meat 10–15 minutes after roasting.',
          'Convection setting reduces time by ~25%.',
        ],
        temp: '175–230°C / 350–450°F',
      },
    };

    const key = Object.keys(techniques).find(
      (k) =>
        technique.toLowerCase().includes(k) ||
        k.includes(technique.toLowerCase())
    );
    const info = key ? techniques[key] : null;

    return {
      success: true,
      data: {
        technique,
        ...(info || {
          description: `Information about "${technique}" not in the local knowledge base.`,
          tips: ['Ask the assistant to explain this technique in detail.'],
        }),
      },
    };
  }
);

/** ─── get_wine_pairing ───────────────────────────────────────────── */

const getWinePairing = createTool(
  {
    name: 'get_wine_pairing',
    description: 'Get wine pairing recommendations for a dish or cuisine.',
    category: 'food',
    tags: ['wine', 'pairing', 'food'],
    parameters: {
      type: 'object',
      properties: {
        dish: {
          type: 'string',
          description:
            'Dish or cuisine to pair with (e.g. "salmon", "beef tenderloin", "spicy Thai")',
        },
      },
      required: ['dish'],
    },
  },
  async (params) => {
    const dish = (params.dish as string).toLowerCase();

    const pairings: { keywords: string[]; wines: string[]; notes: string }[] = [
      {
        keywords: [
          'salmon',
          'trout',
          'fish',
          'seafood',
          'shrimp',
          'lobster',
          'shellfish',
        ],
        wines: [
          'Chablis',
          'Sauvignon Blanc',
          'Pinot Gris',
          'unoaked Chardonnay',
        ],
        notes:
          'White wines with acidity cut through fat and complement ocean flavours.',
      },
      {
        keywords: ['beef', 'steak', 'lamb', 'venison', 'bison'],
        wines: ['Cabernet Sauvignon', 'Malbec', 'Merlot', 'Syrah/Shiraz'],
        notes:
          'Bold reds with tannins balance the richness and fat in red meat.',
      },
      {
        keywords: ['chicken', 'turkey', 'pork', 'veal'],
        wines: ['Chardonnay', 'Pinot Noir', 'Viognier', 'Grenache'],
        notes:
          'Lighter reds or full-bodied whites pair with poultry and white meat.',
      },
      {
        keywords: ['pasta', 'tomato', 'italian', 'pizza'],
        wines: ['Sangiovese', 'Chianti', 'Barbera', 'Montepulciano'],
        notes:
          'Italian reds with high acidity are the classic match for tomato-based dishes.',
      },
      {
        keywords: ['spicy', 'thai', 'indian', 'sichuan', 'curry'],
        wines: [
          'off-dry Riesling',
          'Gewurztraminer',
          'Viognier',
          'sparkling wine',
        ],
        notes:
          'A touch of sweetness and low alcohol tame the heat in spicy food.',
      },
      {
        keywords: ['cheese', 'charcuterie', 'appetizer'],
        wines: ['Champagne', 'Prosecco', 'Beaujolais', 'Grüner Veltliner'],
        notes: 'Versatile options that work across a range of flavours.',
      },
      {
        keywords: ['chocolate', 'dessert', 'cake', 'sweet'],
        wines: ['Port', 'Banyuls', 'Sauternes', 'Vin Santo'],
        notes:
          'Dessert wines must be sweeter than the dish or they taste harsh.',
      },
    ];

    const match = pairings.find((p) =>
      p.keywords.some((k) => dish.includes(k))
    );

    return {
      success: true,
      data: {
        dish: params.dish,
        recommendations: match?.wines ?? [
          'Sparkling wine (a safe, crowd-pleasing default)',
        ],
        notes:
          match?.notes ??
          'No specific pairing found. Sparkling wines are universally versatile.',
        tip: 'Match the weight of the wine to the weight of the dish. Light dish = light wine.',
      },
    };
  }
);

// Register all food tools
const registry = getToolRegistry();
registry.register(searchRecipes);
registry.register(getRecipe);
registry.register(suggestRecipeFromIngredients);
registry.register(scaleRecipe);
registry.register(lookupIngredientSubstitution);
registry.register(getCookingTechnique);
registry.register(getWinePairing);

export {
  searchRecipes,
  getRecipe,
  suggestRecipeFromIngredients,
  scaleRecipe,
  lookupIngredientSubstitution,
  getCookingTechnique,
  getWinePairing,
};
