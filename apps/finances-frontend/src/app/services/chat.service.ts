import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  Subject,
  from,
  of,
  switchMap,
  concat,
  map,
  catchError,
  finalize,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { FinanceApiService } from './finance-api.service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolResults?: ToolResult[];
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: ToolCall[];
  };
  done: boolean;
}

export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

// Tool definitions for Ollama
const FINANCE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_net_worth',
      description:
        "Get the user's current net worth including total assets, liabilities, and breakdown by account",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spending_summary',
      description:
        'Get spending summary for a date range including income, expenses, and breakdown by category',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          endDate: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_trends',
      description:
        'Get monthly income, expenses, and net cash flow trends over the past several months',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'number',
            description: 'Number of months to retrieve (default 6)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account_summary',
      description:
        'Get a summary of all accounts including count, total balance, and breakdown by account type',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transaction_stats',
      description:
        'Get transaction statistics including totals, counts, and breakdown by category',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Optional start date filter in YYYY-MM-DD format',
          },
          endDate: {
            type: 'string',
            description: 'Optional end date filter in YYYY-MM-DD format',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Get all spending categories configured by the user',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_transactions',
      description: 'Get recent transactions with optional filters',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description:
              'Maximum number of transactions to return (default 20)',
          },
          category: {
            type: 'string',
            description: 'Filter by category name',
          },
          search: {
            type: 'string',
            description:
              'Search term to filter transactions by name or merchant',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard',
      description:
        'Get the complete dashboard summary including net worth, spending, unreviewed count, and connected banks',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a helpful financial assistant for a personal finance tracking application. You have access to the user's financial data through various tools. 

When answering questions:
- Be concise but informative
- Format currency values nicely (e.g., $1,234.56)
- When showing trends or comparisons, highlight key insights
- If you don't have enough data to answer, say so clearly
- Proactively offer insights when relevant

Available financial data you can access:
- Net worth (assets, liabilities, account breakdown)
- Spending summaries (by category, by day)
- Monthly trends (income, expenses, cash flow over time)
- Account information (balances, types)
- Transaction details and statistics
- Categories configured by the user

Today's date is ${new Date().toISOString().split('T')[0]}.`;

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly _http = inject(HttpClient);
  private readonly _financeApi = inject(FinanceApiService);
  private readonly ollamaUrl =
    environment.ollamaUrl || 'http://localhost:11434';

  private conversationHistory: Array<{ role: string; content: string }> = [];

  /**
   * Send a message to the chat and get a response
   */
  sendMessage(userMessage: string): Observable<{
    content: string;
    toolResults: ToolResult[];
    done: boolean;
  }> {
    const responseSubject = new Subject<{
      content: string;
      toolResults: ToolResult[];
      done: boolean;
    }>();

    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    this.processChat(responseSubject);

    return responseSubject.asObservable();
  }

  private processChat(
    responseSubject: Subject<{
      content: string;
      toolResults: ToolResult[];
      done: boolean;
    }>
  ): void {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversationHistory,
    ];

    this._http
      .post<OllamaResponse>(`${this.ollamaUrl}/api/chat`, {
        model: 'llama3.2',
        messages,
        tools: FINANCE_TOOLS,
        stream: false,
      })
      .pipe(
        switchMap((response) => {
          const assistantMessage = response.message;

          // Check if there are tool calls
          if (
            assistantMessage.tool_calls &&
            assistantMessage.tool_calls.length > 0
          ) {
            return this.executeToolCalls(assistantMessage.tool_calls).pipe(
              switchMap((toolResults) => {
                // Add assistant message with tool calls to history
                this.conversationHistory.push({
                  role: 'assistant',
                  content: assistantMessage.content || '',
                });

                // Add tool results to history
                for (const toolResult of toolResults) {
                  this.conversationHistory.push({
                    role: 'tool',
                    content: JSON.stringify({
                      name: toolResult.name,
                      result: toolResult.result,
                    }),
                  });
                }

                // Emit tool results
                responseSubject.next({
                  content: '',
                  toolResults,
                  done: false,
                });

                // Make another call to get the final response
                return this._http.post<OllamaResponse>(
                  `${this.ollamaUrl}/api/chat`,
                  {
                    model: 'llama3.2',
                    messages: [
                      { role: 'system', content: SYSTEM_PROMPT },
                      ...this.conversationHistory,
                    ],
                    stream: false,
                  }
                );
              }),
              map((finalResponse) => {
                const finalContent = finalResponse.message.content;
                this.conversationHistory.push({
                  role: 'assistant',
                  content: finalContent,
                });
                responseSubject.next({
                  content: finalContent,
                  toolResults: [],
                  done: true,
                });
                responseSubject.complete();
                return finalResponse;
              })
            );
          } else {
            // No tool calls, just return the response
            const content = assistantMessage.content;
            this.conversationHistory.push({
              role: 'assistant',
              content,
            });
            responseSubject.next({
              content,
              toolResults: [],
              done: true,
            });
            responseSubject.complete();
            return of(response);
          }
        }),
        catchError((error) => {
          console.error('Chat error:', error);
          responseSubject.next({
            content:
              'Sorry, I encountered an error processing your request. Please try again.',
            toolResults: [],
            done: true,
          });
          responseSubject.complete();
          return of(null);
        })
      )
      .subscribe();
  }

  private executeToolCalls(toolCalls: ToolCall[]): Observable<ToolResult[]> {
    const toolObservables = toolCalls.map((toolCall) =>
      this.executeTool(toolCall.function.name, toolCall.function.arguments)
    );

    // Execute all tool calls in parallel and collect results
    return from(
      Promise.all(
        toolObservables.map(
          (obs) =>
            new Promise<ToolResult>((resolve) => {
              obs.subscribe({
                next: (result) => resolve(result),
                error: (err) => resolve({ name: 'error', result: err.message }),
              });
            })
        )
      )
    );
  }

  private executeTool(
    name: string,
    args: Record<string, unknown>
  ): Observable<ToolResult> {
    switch (name) {
      case 'get_net_worth':
        return this._financeApi.getNetWorth().pipe(
          map((result) => ({ name, result })),
          catchError((err) => of({ name, result: { error: err.message } }))
        );

      case 'get_spending_summary':
        return this._financeApi
          .getSpending(args['startDate'] as string, args['endDate'] as string)
          .pipe(
            map((result) => ({ name, result })),
            catchError((err) => of({ name, result: { error: err.message } }))
          );

      case 'get_monthly_trends':
        return this._financeApi
          .getMonthlyTrends(args['months'] as number | undefined)
          .pipe(
            map((result) => ({ name, result })),
            catchError((err) => of({ name, result: { error: err.message } }))
          );

      case 'get_account_summary':
        return this._financeApi.getAccountSummary().pipe(
          map((result) => ({ name, result })),
          catchError((err) => of({ name, result: { error: err.message } }))
        );

      case 'get_transaction_stats':
        return this._financeApi
          .getTransactionStats(
            args['startDate'] as string | undefined,
            args['endDate'] as string | undefined
          )
          .pipe(
            map((result) => ({ name, result })),
            catchError((err) => of({ name, result: { error: err.message } }))
          );

      case 'get_categories':
        return this._financeApi.getAllCategories().pipe(
          map((result) => ({ name, result })),
          catchError((err) => of({ name, result: { error: err.message } }))
        );

      case 'get_recent_transactions':
        const filters: Record<string, unknown> = {};
        if (args['search']) filters['search'] = args['search'];
        if (args['category']) filters['categoryId'] = args['category'];

        return this._financeApi.getAllTransactions(filters as any).pipe(
          map((transactions) => {
            const limit = (args['limit'] as number) || 20;
            return {
              name,
              result: transactions.slice(0, limit).map((tx) => ({
                date: tx.date,
                name: tx.merchantName || tx.name,
                amount: tx.amount,
                type: tx.type,
                category: tx.category,
                account: tx.accountName,
              })),
            };
          }),
          catchError((err) => of({ name, result: { error: err.message } }))
        );

      case 'get_dashboard':
        return this._financeApi.getDashboard().pipe(
          map((result) => ({ name, result })),
          catchError((err) => of({ name, result: { error: err.message } }))
        );

      default:
        return of({ name, result: { error: `Unknown tool: ${name}` } });
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): Array<{ role: string; content: string }> {
    return [...this.conversationHistory];
  }
}
