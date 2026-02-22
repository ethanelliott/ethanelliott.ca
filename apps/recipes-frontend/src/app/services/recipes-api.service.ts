import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ==================== Category Types ====================

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

// ==================== Tag Types ====================

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagInput {
  name: string;
  description?: string;
  color?: string;
}

// ==================== Ingredient Types ====================

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IngredientInput {
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  orderIndex?: number;
}

// ==================== Recipe Photo Types ====================

export interface RecipePhoto {
  id: string;
  filename: string;
  mimeType: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoUpload {
  filename: string;
  mimeType: string;
  data: string; // base64 encoded
}

// ==================== Recipe Types ====================

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  notes: string | null;
  source: string | null;
  ingredients: Ingredient[];
  categories: Category[];
  tags: Tag[];
  photos?: RecipePhoto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  categories: Category[];
  tags: Tag[];
  photoCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeInput {
  title: string;
  description?: string;
  instructions?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  notes?: string;
  source?: string;
  ingredients?: IngredientInput[];
  categoryIds?: string[];
  tagIds?: string[];
}

export interface RecipeFilters {
  search?: string;
  categoryIds?: string[];
  tagIds?: string[];
}

// ==================== Grocery List Types ====================

export interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
}

export interface GroceryList {
  items: GroceryItem[];
  recipeCount: number;
  totalServings: number;
}

export interface GroceryListRequest {
  recipes: Array<{
    recipeId: string;
    servings: number;
  }>;
}

// ==================== AI Types ====================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SuggestionItem {
  id: string;
  name: string;
  confidence: number;
}

export interface TagsAndCategoriesSuggestion {
  suggestedCategories: SuggestionItem[];
  suggestedTags: SuggestionItem[];
}

export interface ChatRequest {
  question: string;
  history?: Message[];
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

export interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: ParsedIngredient[];
  instructions: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  source?: string;
  imageUrls?: string[];
}

export interface ImportProgressEvent {
  type: 'progress' | 'result' | 'error';
  step?: string;
  message?: string;
  percent?: number;
  result?: ParsedRecipe;
  error?: string;
}

// ==================== Service ====================

@Injectable({
  providedIn: 'root',
})
export class RecipesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  // ==================== Categories ====================

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/categories`);
  }

  getCategory(id: string): Observable<Category> {
    return this.http.get<Category>(`${this.baseUrl}/categories/${id}`);
  }

  createCategory(input: CategoryInput): Observable<Category> {
    return this.http.post<Category>(`${this.baseUrl}/categories`, input);
  }

  updateCategory(
    id: string,
    input: Partial<CategoryInput>
  ): Observable<Category> {
    return this.http.patch<Category>(`${this.baseUrl}/categories/${id}`, input);
  }

  deleteCategory(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/categories/${id}`
    );
  }

  // ==================== Tags ====================

  getTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.baseUrl}/tags`);
  }

  getTag(id: string): Observable<Tag> {
    return this.http.get<Tag>(`${this.baseUrl}/tags/${id}`);
  }

  createTag(input: TagInput): Observable<Tag> {
    return this.http.post<Tag>(`${this.baseUrl}/tags`, input);
  }

  updateTag(id: string, input: Partial<TagInput>): Observable<Tag> {
    return this.http.patch<Tag>(`${this.baseUrl}/tags/${id}`, input);
  }

  deleteTag(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/tags/${id}`);
  }

  // ==================== Recipes ====================

  getRecipes(filters?: RecipeFilters): Observable<RecipeSummary[]> {
    let params = new HttpParams();
    if (filters?.search) {
      params = params.set('search', filters.search);
    }
    if (filters?.categoryIds?.length) {
      params = params.set('categoryIds', filters.categoryIds.join(','));
    }
    if (filters?.tagIds?.length) {
      params = params.set('tagIds', filters.tagIds.join(','));
    }
    return this.http.get<RecipeSummary[]>(`${this.baseUrl}/recipes`, {
      params,
    });
  }

  getRecipe(id: string): Observable<Recipe> {
    return this.http.get<Recipe>(`${this.baseUrl}/recipes/${id}`);
  }

  getRandomRecipe(filters?: {
    categoryIds?: string[];
    tagIds?: string[];
  }): Observable<Recipe | null> {
    let params = new HttpParams();
    if (filters?.categoryIds?.length) {
      params = params.set('categoryIds', filters.categoryIds.join(','));
    }
    if (filters?.tagIds?.length) {
      params = params.set('tagIds', filters.tagIds.join(','));
    }
    return this.http.get<Recipe | null>(`${this.baseUrl}/recipes/random`, {
      params,
    });
  }

  createRecipe(input: RecipeInput): Observable<Recipe> {
    return this.http.post<Recipe>(`${this.baseUrl}/recipes`, input);
  }

  updateRecipe(id: string, input: Partial<RecipeInput>): Observable<Recipe> {
    return this.http.patch<Recipe>(`${this.baseUrl}/recipes/${id}`, input);
  }

  deleteRecipe(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/recipes/${id}`
    );
  }

  getScaledIngredients(
    recipeId: string,
    servings: number
  ): Observable<Ingredient[]> {
    const params = new HttpParams().set('servings', servings.toString());
    return this.http.get<Ingredient[]>(
      `${this.baseUrl}/recipes/${recipeId}/scaled-ingredients`,
      { params }
    );
  }

  // ==================== Photos ====================

  uploadPhoto(recipeId: string, photo: PhotoUpload): Observable<RecipePhoto> {
    return this.http.post<RecipePhoto>(
      `${this.baseUrl}/recipes/${recipeId}/photos`,
      photo
    );
  }

  importPhotosFromUrls(
    recipeId: string,
    urls: string[]
  ): Observable<{ imported: number; failed: number }> {
    return this.http.post<{ imported: number; failed: number }>(
      `${this.baseUrl}/recipes/${recipeId}/photos/import`,
      { urls }
    );
  }

  getPhotoUrl(photoId: string): string {
    return `${this.baseUrl}/recipes/photos/${photoId}`;
  }

  deletePhoto(photoId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/recipes/photos/${photoId}`
    );
  }

  // ==================== Grocery List ====================

  generateGroceryList(request: GroceryListRequest): Observable<GroceryList> {
    return this.http.post<GroceryList>(
      `${this.baseUrl}/grocery-list/generate`,
      request
    );
  }

  // ==================== AI Features ====================

  /**
   * Suggest categories and tags for a recipe based on its content
   */
  suggestTagsAndCategories(
    recipeId: string
  ): Observable<TagsAndCategoriesSuggestion> {
    return this.http.post<TagsAndCategoriesSuggestion>(
      `${this.baseUrl}/ai/suggest-tags/${recipeId}`,
      {}
    );
  }

  /**
   * Chat with AI about a specific recipe
   */
  chatAboutRecipe(
    recipeId: string,
    question: string,
    history: Message[] = []
  ): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.baseUrl}/ai/chat/${recipeId}`, {
      question,
      history,
    });
  }

  /**
   * Stream chat with AI about a specific recipe (SSE)
   * Returns an Observable that emits tokens as they arrive
   */
  chatAboutRecipeStream(
    recipeId: string,
    question: string,
    history: Message[] = []
  ): Observable<{ token: string; done: boolean }> {
    return new Observable((subscriber) => {
      const abortController = new AbortController();

      fetch(`${this.baseUrl}/ai/chat/${recipeId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Chat stream failed: ${response.status}`);
          }
          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (done) break;

            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') {
                subscriber.complete();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  subscriber.error(new Error(parsed.error));
                  return;
                }
                subscriber.next(parsed);
              } catch {
                // Skip malformed SSE data
              }
            }
          }
          subscriber.complete();
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            subscriber.error(error);
          }
        });

      return () => abortController.abort();
    });
  }

  /**
   * Get cooking tips and common mistakes for a recipe
   */
  getCookingTips(recipeId: string): Observable<CookingTipsResponse> {
    return this.http.post<CookingTipsResponse>(
      `${this.baseUrl}/ai/cooking-tips/${recipeId}`,
      {}
    );
  }

  /**
   * Analyze flavor profile of a recipe
   */
  analyzeFlavorProfile(recipeId: string): Observable<FlavorProfileResponse> {
    return this.http.post<FlavorProfileResponse>(
      `${this.baseUrl}/ai/flavor-profile/${recipeId}`,
      {}
    );
  }

  /**
   * Parse recipe from pasted text/webpage content
   */
  parseRecipeFromText(text: string): Observable<ParsedRecipe> {
    return this.http.post<ParsedRecipe>(`${this.baseUrl}/ai/parse-recipe`, {
      text,
    });
  }

  /**
   * Parse recipe from a URL (fetches page and extracts JSON-LD Recipe data)
   */
  parseRecipeFromUrl(url: string): Observable<ParsedRecipe> {
    return this.http.post<ParsedRecipe>(`${this.baseUrl}/ai/parse-recipe-url`, {
      url,
    });
  }

  /**
   * Parse recipe from URL with streaming progress events (SSE)
   */
  parseRecipeFromUrlStream(url: string): Observable<ImportProgressEvent> {
    return this.streamParseRequest(
      `${this.baseUrl}/ai/parse-recipe-url/stream`,
      { url }
    );
  }

  /**
   * Parse recipe from text with streaming progress events (SSE)
   */
  parseRecipeFromTextStream(text: string): Observable<ImportProgressEvent> {
    return this.streamParseRequest(`${this.baseUrl}/ai/parse-recipe/stream`, {
      text,
    });
  }

  private streamParseRequest(
    endpoint: string,
    body: Record<string, string>
  ): Observable<ImportProgressEvent> {
    return new Observable((subscriber) => {
      const abortController = new AbortController();

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Import failed: ${response.status}`);
          }
          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (done) break;

            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') {
                subscriber.complete();
                return;
              }
              try {
                const parsed: ImportProgressEvent = JSON.parse(data);
                if (parsed.type === 'error') {
                  subscriber.error(new Error(parsed.error || 'Unknown error'));
                  return;
                }
                subscriber.next(parsed);
              } catch {
                // Skip malformed SSE data
              }
            }
          }
          subscriber.complete();
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            subscriber.error(error);
          }
        });

      return () => abortController.abort();
    });
  }
}
