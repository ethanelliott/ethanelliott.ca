import { Agent, registerAgent } from './agent';
import { getToolRegistry } from '../mcp';
import { getOllamaClient } from '../ollama';

/**
 * Tool Router Agent
 *
 * A specialized agent that efficiently selects the most relevant tools
 * for a given task. This is useful when you have many tools and want
 * to avoid overwhelming the main agent with all of them.
 *
 * The router uses a fast model to quickly identify which categories
 * or specific tools are needed before passing to the main agent.
 */
export class ToolRouterAgent extends Agent {
  constructor() {
    super({
      name: 'tool-router',
      description: 'Efficiently routes tasks to the appropriate tools',
      systemPrompt: `You are a tool routing assistant. Your job is to analyze user requests and determine which tools would be most helpful.

Given a user's request, output a JSON object with:
- "selectedTools": array of tool names that would be useful
- "reasoning": brief explanation of why these tools were selected

Be selective - only choose tools that are directly relevant to the request.
If no tools are needed, return an empty array for selectedTools.`,
      model: 'functiongemma', // Use fast model for routing
      tools: [], // Router doesn't use tools directly
    });
  }

  /**
   * Analyze a task and return the most relevant tool names
   */
  async selectTools(task: string, maxTools: number = 5): Promise<string[]> {
    const registry = getToolRegistry();
    const allTools = registry.getAll();

    if (allTools.length <= maxTools) {
      // If we have few tools, just return all of them
      return allTools.map((t) => t.name);
    }

    // Build a summary of available tools for the router
    const toolList = allTools
      .map((t) => `- ${t.name}: ${t.description} [${t.category || 'General'}]`)
      .join('\n');

    const prompt = `Available tools:
${toolList}

User request: "${task}"

Select the most relevant tools (up to ${maxTools}) for this request. Respond with a JSON object.`;

    try {
      const response = await this.ollama.complete(
        prompt,
        this.config.model || 'functiongemma',
        this.config.systemPrompt
      );

      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.selectedTools)) {
          // Validate tool names exist
          const validTools = parsed.selectedTools.filter((name: string) =>
            registry.get(name)
          );
          return validTools.slice(0, maxTools);
        }
      }

      // Fallback: return all tools if parsing fails
      console.warn(
        '[ToolRouter] Failed to parse tool selection, returning all tools'
      );
      return allTools.slice(0, maxTools).map((t) => t.name);
    } catch (error) {
      console.error('[ToolRouter] Error selecting tools:', error);
      return allTools.slice(0, maxTools).map((t) => t.name);
    }
  }

  /**
   * Get tools by category matching keywords in the task
   */
  async selectToolsByKeywords(task: string): Promise<string[]> {
    const registry = getToolRegistry();
    const categories = registry.getCategories();
    const selected: Set<string> = new Set();

    const taskLower = task.toLowerCase();

    // Simple keyword matching for fast selection
    const categoryKeywords: Record<string, string[]> = {
      Recipes: [
        'recipe',
        'food',
        'cook',
        'meal',
        'ingredient',
        'grocery',
        'dinner',
        'lunch',
        'breakfast',
      ],
      System: [
        'time',
        'date',
        'calculate',
        'math',
        'http',
        'fetch',
        'request',
        'api',
      ],
      Finances: [
        'money',
        'budget',
        'spend',
        'expense',
        'cost',
        'price',
        'pay',
        'transaction',
      ],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((kw) => taskLower.includes(kw))) {
        const tools = registry.getByCategory(category);
        tools.forEach((t) => selected.add(t.name));
      }
    }

    // If no matches, include system tools as fallback
    if (selected.size === 0) {
      const systemTools = registry.getByCategory('System');
      systemTools.forEach((t) => selected.add(t.name));
    }

    return Array.from(selected);
  }
}

// Create and register the tool router
const toolRouter = new ToolRouterAgent();
registerAgent(toolRouter);

export { toolRouter };
export function getToolRouter(): ToolRouterAgent {
  return toolRouter;
}
