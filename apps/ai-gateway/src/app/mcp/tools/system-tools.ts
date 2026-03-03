import { createTool, getToolRegistry } from '../tool-registry';

/**
 * System tools - basic utilities for the AI gateway
 */

const getCurrentTime = createTool(
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    category: 'System',
    tags: ['time', 'utility'],
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Timezone to use (e.g., "America/New_York", "UTC"). Defaults to UTC.',
        },
      },
    },
  },
  async (params) => {
    const timezone = (params.timezone as string) || 'UTC';
    const now = new Date();

    try {
      const formatted = now.toLocaleString('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      });

      return {
        success: true,
        data: {
          iso: now.toISOString(),
          formatted,
          timezone,
          timestamp: now.getTime(),
        },
      };
    } catch {
      return {
        success: true,
        data: {
          iso: now.toISOString(),
          formatted: now.toString(),
          timezone: 'UTC',
          timestamp: now.getTime(),
        },
      };
    }
  }
);

const calculate = createTool(
  {
    name: 'calculate',
    description:
      'Perform basic mathematical calculations. Supports +, -, *, /, %, ^, sqrt, sin, cos, tan, log, abs',
    category: 'System',
    tags: ['math', 'utility'],
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(3.14159/2)")',
        },
      },
      required: ['expression'],
    },
  },
  async (params) => {
    const expression = params.expression as string;

    // Safe math evaluation using Function with limited scope
    const mathFunctions: Record<string, (...args: number[]) => number> = {
      sqrt: Math.sqrt,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      log: Math.log,
      log10: Math.log10,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
      PI: () => Math.PI,
      E: () => Math.E,
    };

    try {
      // Replace ^ with ** for exponentiation
      let sanitized = expression.replace(/\^/g, '**');

      // Replace math function names with safe versions
      for (const [name, fn] of Object.entries(mathFunctions)) {
        if (typeof fn === 'function' && fn.length === 0) {
          // Constants like PI, E
          sanitized = sanitized.replace(
            new RegExp(`\\b${name}\\b`, 'g'),
            String(fn())
          );
        }
      }

      // Validate: only allow numbers, operators, parentheses, and math functions
      const allowedPattern = /^[0-9+\-*/().%\s,*]+$/;
      const withoutFunctions = sanitized.replace(
        /\b(sqrt|sin|cos|tan|log|log10|abs|floor|ceil|round|pow|min|max)\s*\(/g,
        '('
      );

      if (!allowedPattern.test(withoutFunctions)) {
        return {
          success: false,
          error: 'Invalid characters in expression',
        };
      }

      // Create a safe evaluation function
      const safeEval = new Function(
        ...Object.keys(mathFunctions),
        `"use strict"; return (${sanitized});`
      );

      const result = safeEval(...Object.values(mathFunctions));

      if (typeof result !== 'number' || !isFinite(result)) {
        return {
          success: false,
          error: 'Result is not a valid number',
        };
      }

      return {
        success: true,
        data: {
          expression,
          result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to evaluate expression: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
);

const httpRequest = createTool(
  {
    name: 'http_request',
    description:
      'Make an HTTP request to fetch data from a URL. Only GET requests are supported for safety.',
    category: 'System',
    tags: ['http', 'api', 'fetch'],
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
        headers: {
          type: 'object',
          description: 'Optional headers to include in the request',
        },
      },
      required: ['url'],
    },
  },
  async (params) => {
    const url = params.url as string;
    const headers = (params.headers as Record<string, string>) || {};

    // Validate URL
    try {
      const parsedUrl = new URL(url);
      // Only allow http/https
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          success: false,
          error: 'Only HTTP and HTTPS protocols are allowed',
        };
      }
    } catch {
      return {
        success: false,
        error: 'Invalid URL',
      };
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'AI-Gateway/1.0',
          ...headers,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const contentType = response.headers.get('content-type') || '';
      let data: unknown;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
        // Truncate very long text responses
        if (typeof data === 'string' && data.length > 10000) {
          data = data.slice(0, 10000) + '... [truncated]';
        }
      }

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          contentType,
          data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `HTTP request failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
);

/**
 * Sensitive Action Tool - Example of a tool requiring human approval
 *
 * This demonstrates the human-in-the-loop pattern where:
 * 1. The LLM decides to call this tool
 * 2. The user is asked to approve with a justification
 * 3. Only after approval does the tool execute
 */
const sensitiveAction = createTool(
  {
    name: 'sensitive_action',
    description:
      'Perform a sensitive action that requires user approval. Use this when the user asks to do something that has significant consequences.',
    category: 'System',
    tags: ['sensitive', 'approval', 'action'],
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Description of the action to perform',
        },
        target: {
          type: 'string',
          description: 'The target of the action (e.g., a resource name)',
        },
        severity: {
          type: 'string',
          description: 'Severity level: low, medium, high',
          enum: ['low', 'medium', 'high'],
        },
      },
      required: ['action', 'target'],
    },
    // Approval configuration
    approval: {
      required: true,
      message:
        'This action requires your approval before proceeding. Please review the details and provide a justification if you approve.',
      userParametersSchema: {
        type: 'object',
        properties: {
          justification: {
            type: 'string',
            description:
              'Please provide a business justification for this action',
          },
          acknowledgeRisks: {
            type: 'boolean',
            description: 'I acknowledge the risks of this action',
          },
        },
        required: ['justification', 'acknowledgeRisks'],
      },
    },
  },
  async (params, userParams) => {
    const action = params.action as string;
    const target = params.target as string;
    const severity = (params.severity as string) || 'medium';
    const justification = userParams?.justification as string;
    const acknowledgedRisks = userParams?.acknowledgeRisks as boolean;

    // In a real implementation, this would perform some sensitive action
    // For demo purposes, we just return the details
    return {
      success: true,
      data: {
        action,
        target,
        severity,
        executedAt: new Date().toISOString(),
        approval: {
          justification,
          acknowledgedRisks,
        },
        message: `Sensitive action "${action}" on "${target}" executed successfully.`,
      },
    };
  }
);

/**
 * Ask User Tool - Interactive questionnaire for gathering user input
 *
 * Allows the LLM to ask the user a question with multiple-choice options.
 * The user can select an option or provide a free-text response.
 * Uses the approval flow to pause execution until the user responds.
 */
const askUser = createTool(
  {
    name: 'ask_user',
    description:
      'Ask the user a question. ALWAYS provide multiple-choice options when possible (2-6 options). Only omit options for truly open-ended questions like asking for a name or description. The user can always type a custom answer via an "Other" option.',
    category: 'System',
    tags: ['interactive', 'questionnaire', 'user-input'],
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user',
        },
        options: {
          type: 'array',
          description:
            'Multiple-choice options for the user to pick from (2-6 options). Provide options whenever the question has a reasonable set of choices. Omit only for truly open-ended questions.',
          items: {
            type: 'string',
            description: 'An option label',
          },
        },
        allow_free_text: {
          type: 'boolean',
          description:
            'Whether the user can type a custom answer instead of picking an option. Defaults to true.',
        },
      },
      required: ['question'],
    },
    // Uses approval flow to pause and wait for the user's response
    approval: {
      required: true,
      message: 'The assistant has a question for you.',
      userParametersSchema: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            description: "The user's selected or typed answer",
          },
        },
        required: ['answer'],
      },
    },
  },
  async (params, userParams) => {
    const question = params.question as string;
    const answer = (userParams?.answer as string) || 'No answer provided';

    return {
      success: true,
      data: {
        question,
        answer,
      },
    };
  }
);

// Register all system tools
const registry = getToolRegistry();
registry.register(getCurrentTime);
registry.register(calculate);
registry.register(httpRequest);
registry.register(sensitiveAction);
registry.register(askUser);

export { getCurrentTime, calculate, httpRequest, sensitiveAction, askUser };
