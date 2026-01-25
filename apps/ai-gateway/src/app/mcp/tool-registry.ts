import { MCPToolWithExecutor, MCPToolResult, OllamaTool } from '../types';

/**
 * MCP Tool Registry
 *
 * A centralized registry for MCP-compatible tools that can be:
 * - Registered at startup or dynamically
 * - Discovered by agents
 * - Filtered by category or tags
 * - Converted to Ollama tool format
 */

class ToolRegistry {
  private tools: Map<string, MCPToolWithExecutor> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private tags: Map<string, Set<string>> = new Map();

  /**
   * Register a new tool
   */
  register(tool: MCPToolWithExecutor): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" already registered, overwriting...`);
    }

    this.tools.set(tool.name, tool);

    // Index by category
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }

    // Index by tags
    if (tool.tags) {
      for (const tag of tool.tags) {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, new Set());
        }
        this.tags.get(tag)!.add(tool.name);
      }
    }

    console.log(
      `Registered tool: ${tool.name} [${tool.category || 'uncategorized'}]`
    );
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    this.tools.delete(name);

    // Remove from category index
    if (tool.category) {
      this.categories.get(tool.category)?.delete(name);
    }

    // Remove from tag indexes
    if (tool.tags) {
      for (const tag of tool.tags) {
        this.tags.get(tag)?.delete(name);
      }
    }

    return true;
  }

  /**
   * Get a tool by name
   */
  get(name: string): MCPToolWithExecutor | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): MCPToolWithExecutor[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): MCPToolWithExecutor[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) return [];
    return Array.from(toolNames)
      .map((name) => this.tools.get(name))
      .filter((t): t is MCPToolWithExecutor => t !== undefined);
  }

  /**
   * Get tools by tag
   */
  getByTag(tag: string): MCPToolWithExecutor[] {
    const toolNames = this.tags.get(tag);
    if (!toolNames) return [];
    return Array.from(toolNames)
      .map((name) => this.tools.get(name))
      .filter((t): t is MCPToolWithExecutor => t !== undefined);
  }

  /**
   * Get tools by multiple names
   */
  getByNames(names: string[]): MCPToolWithExecutor[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((t): t is MCPToolWithExecutor => t !== undefined);
  }

  /**
   * Get all category names
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all tag names
   */
  getTags(): string[] {
    return Array.from(this.tags.keys());
  }

  /**
   * Execute a tool by name
   * @param name - Tool name
   * @param params - Parameters from the LLM
   * @param userParams - Optional user-provided parameters (from approval flow)
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    userParams?: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
      };
    }

    const startTime = Date.now();

    try {
      const result = await tool.execute(params, userParams);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTimeMs: Date.now() - startTime,
          hadUserParams: !!userParams,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Convert tools to Ollama format
   */
  toOllamaTools(toolNames?: string[]): OllamaTool[] {
    const tools = toolNames ? this.getByNames(toolNames) : this.getAll();

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Get a summary of all tools for agent prompts
   */
  getToolsSummary(toolNames?: string[]): string {
    const tools = toolNames ? this.getByNames(toolNames) : this.getAll();

    if (tools.length === 0) {
      return 'No tools available.';
    }

    const byCategory = new Map<string, MCPToolWithExecutor[]>();
    for (const tool of tools) {
      const category = tool.category || 'General';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(tool);
    }

    let summary = 'Available tools:\n\n';
    for (const [category, categoryTools] of byCategory) {
      summary += `## ${category}\n`;
      for (const tool of categoryTools) {
        summary += `- **${tool.name}**: ${tool.description}\n`;
      }
      summary += '\n';
    }

    return summary;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.tags.clear();
  }
}

// Singleton instance
const toolRegistry = new ToolRegistry();

export function getToolRegistry(): ToolRegistry {
  return toolRegistry;
}

/**
 * Decorator-style helper to create and register a tool
 */
export function createTool(
  config: Omit<MCPToolWithExecutor, 'execute'>,
  execute: MCPToolWithExecutor['execute']
): MCPToolWithExecutor {
  const tool: MCPToolWithExecutor = {
    ...config,
    execute,
  };
  return tool;
}

/**
 * Register multiple tools at once
 */
export function registerTools(tools: MCPToolWithExecutor[]): void {
  for (const tool of tools) {
    toolRegistry.register(tool);
  }
}

/**
 * Initialize the tool registry (called at startup)
 */
export async function initializeToolRegistry(): Promise<void> {
  console.log('Initializing MCP Tool Registry...');
  // Tools are registered via imports in ./tools/index.ts
}
