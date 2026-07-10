import { createTool, getToolRegistry } from '../tool-registry';

/** ─── env config ──────────────────────────────────────────────── */

const KANBAN_API_URL =
  process.env['KANBAN_API_URL'] || 'http://kanban.default.svc:3333';
const NTFY_URL = process.env['NTFY_URL'];
const NTFY_TOPIC = process.env['NTFY_TOPIC'] || 'ai-gateway';

/** ─── helpers ─────────────────────────────────────────────────── */

async function kanbanGet(path: string) {
  const resp = await fetch(`${KANBAN_API_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok)
    throw new Error(`Kanban API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

async function kanbanPost(path: string, body: unknown) {
  const resp = await fetch(`${KANBAN_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Kanban API ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function kanbanPatch(path: string, body: unknown) {
  const resp = await fetch(`${KANBAN_API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Kanban API ${resp.status}: ${text}`);
  }
  return resp.json();
}

/** ─── create_task ───────────────────────────────────────────────── */

const createTask = createTool(
  {
    name: 'create_task',
    description: 'Create a new task in the kanban board.',
    category: 'productivity',
    tags: ['task', 'kanban'],
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: {
          type: 'string',
          description: 'Optional task description',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default: medium)',
        },
        due_date: {
          type: 'string',
          description: 'Due date (ISO 8601, optional)',
        },
        project_id: {
          type: 'string',
          description: 'Project ID to assign the task to (optional)',
        },
      },
      required: ['title'],
    },
  },
  async (params) => {
    try {
      const body: Record<string, unknown> = {
        title: params.title,
        priority: (params.priority as string) || 'medium',
      };
      if (params.description) body['description'] = params.description;
      if (params.due_date) body['due_date'] = params.due_date;
      if (params.project_id) body['project_id'] = params.project_id;

      const task = await kanbanPost('/tasks', body);
      return { success: true, data: task };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── list_tasks ────────────────────────────────────────────────── */

const listTasks = createTool(
  {
    name: 'list_tasks',
    description:
      'List tasks from the kanban board with optional state/project filters.',
    category: 'productivity',
    tags: ['task', 'kanban', 'list'],
    parameters: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Filter by state: todo, in_progress, review, done',
          enum: ['todo', 'in_progress', 'review', 'done'],
        },
        project_id: { type: 'string', description: 'Filter by project ID' },
        limit: {
          type: 'number',
          description: 'Max tasks to return (default: 20)',
        },
      },
    },
  },
  async (params) => {
    try {
      const qp = new URLSearchParams();
      if (params.state) qp.set('state', params.state as string);
      if (params.project_id) qp.set('project_id', params.project_id as string);
      if (params.limit) qp.set('limit', String(params.limit));

      const data = await kanbanGet(`/tasks?${qp.toString()}`);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── update_task ───────────────────────────────────────────────── */

const updateTask = createTool(
  {
    name: 'update_task',
    description:
      'Update an existing task (title, description, priority, state, or due date).',
    category: 'productivity',
    tags: ['task', 'kanban'],
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
        },
        state: {
          type: 'string',
          enum: ['todo', 'in_progress', 'review', 'done'],
        },
        due_date: { type: 'string', description: 'New due date (ISO 8601)' },
      },
      required: ['task_id'],
    },
  },
  async (params) => {
    try {
      const body: Record<string, unknown> = {};
      if (params.title) body['title'] = params.title;
      if (params.description) body['description'] = params.description;
      if (params.priority) body['priority'] = params.priority;
      if (params.state) body['state'] = params.state;
      if (params.due_date) body['due_date'] = params.due_date;

      const task = await kanbanPatch(`/tasks/${params.task_id}`, body);
      return { success: true, data: task };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

/** ─── get_todays_tasks ──────────────────────────────────────────── */

const getTodaysTasks = createTool(
  {
    name: 'get_todays_tasks',
    description: 'Get tasks due today or currently in progress.',
    category: 'productivity',
    tags: ['task', 'kanban', 'today'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Fetch both in_progress and todo tasks
      const [inProgress, todo] = await Promise.all([
        kanbanGet('/tasks?state=in_progress&limit=50'),
        kanbanGet(`/tasks?state=todo&limit=50`),
      ]);

      const allTasks = [
        ...(inProgress.tasks || inProgress || []),
        ...(todo.tasks || todo || []),
      ];

      // Filter tasks due today or in_progress
      const todayTasks = allTasks.filter((t: any) => {
        if (t.state === 'in_progress') return true;
        if (t.due_date && t.due_date.startsWith(today)) return true;
        return false;
      });

      return {
        success: true,
        data: {
          date: today,
          count: todayTasks.length,
          tasks: todayTasks,
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

const registry = getToolRegistry();
registry.register(createTask);
registry.register(listTasks);
registry.register(updateTask);
registry.register(getTodaysTasks);

export {
  createTask,
  listTasks,
  updateTask,
  getTodaysTasks,
};
