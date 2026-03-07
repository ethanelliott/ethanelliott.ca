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

/** ─── In-memory notes store ────────────────────────────────────── */

interface Note {
  id: string;
  content: string;
  createdAt: string;
  tags: string[];
}
const notesStore: Note[] = [];
let noteIdCounter = 1;

/** ─── In-memory focus tracking ─────────────────────────────────── */

let focusSession: { start: string; label: string } | null = null;

/** ─── In-memory habit tracker ──────────────────────────────────── */

interface HabitEntry {
  habit: string;
  date: string; // yyyy-mm-dd
}
const habitLog: HabitEntry[] = [];

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

/** ─── create_note ───────────────────────────────────────────────── */

const createNote = createTool(
  {
    name: 'create_note',
    description: 'Store a timestamped note in the in-memory notes store.',
    category: 'productivity',
    tags: ['notes', 'memory'],
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Note content' },
        tags: {
          type: 'array',
          description: 'Optional tags',
          items: { type: 'string', description: 'Tag' },
        },
      },
      required: ['content'],
    },
  },
  async (params) => {
    const note: Note = {
      id: String(noteIdCounter++),
      content: params.content as string,
      createdAt: new Date().toISOString(),
      tags: (params.tags as string[]) || [],
    };
    notesStore.push(note);
    return { success: true, data: note };
  }
);

/** ─── list_notes ─────────────────────────────────────────────────── */

const listNotes = createTool(
  {
    name: 'list_notes',
    description: 'Retrieve notes by date range or keyword.',
    category: 'productivity',
    tags: ['notes', 'memory'],
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Search keyword (case-insensitive)',
        },
        from_date: {
          type: 'string',
          description: 'Start date filter (ISO 8601)',
        },
        to_date: { type: 'string', description: 'End date filter (ISO 8601)' },
        limit: { type: 'number', description: 'Max notes (default: 10)' },
      },
    },
  },
  async (params) => {
    let notes = [...notesStore].reverse();
    const keyword = params.keyword as string | undefined;
    const fromDate = params.from_date
      ? new Date(params.from_date as string)
      : null;
    const toDate = params.to_date ? new Date(params.to_date as string) : null;
    const limit = (params.limit as number) || 10;

    if (keyword) {
      const kw = keyword.toLowerCase();
      notes = notes.filter(
        (n) =>
          n.content.toLowerCase().includes(kw) ||
          n.tags.some((t) => t.toLowerCase().includes(kw))
      );
    }
    if (fromDate)
      notes = notes.filter((n) => new Date(n.createdAt) >= fromDate);
    if (toDate) notes = notes.filter((n) => new Date(n.createdAt) <= toDate);

    return {
      success: true,
      data: { count: notes.length, notes: notes.slice(0, limit) },
    };
  }
);

/** ─── start_focus_block ─────────────────────────────────────────── */

const startFocusBlock = createTool(
  {
    name: 'start_focus_block',
    description:
      'Start a focus session timer. Optionally sends an ntfy push notification.',
    category: 'productivity',
    tags: ['focus', 'productivity'],
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'What you are focusing on' },
      },
    },
  },
  async (params) => {
    const label = (params.label as string) || 'focus session';
    focusSession = { start: new Date().toISOString(), label };

    if (NTFY_URL) {
      await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: 'POST',
        headers: { Title: 'Focus Mode ON 🎯', Tags: 'brain', Priority: '2' },
        body: `Starting focus block: ${label}`,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    return {
      success: true,
      data: {
        message: `Focus block started: ${label}`,
        startedAt: focusSession.start,
      },
    };
  }
);

/** ─── end_focus_block ───────────────────────────────────────────── */

const endFocusBlock = createTool(
  {
    name: 'end_focus_block',
    description: 'End the current focus session and log its duration.',
    category: 'productivity',
    tags: ['focus', 'productivity'],
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    if (!focusSession) {
      return {
        success: false,
        error: 'No active focus session found. Start one first.',
      };
    }

    const endTime = new Date();
    const startTime = new Date(focusSession.start);
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMin = Math.round(durationMs / 60000);
    const label = focusSession.label;
    focusSession = null;

    if (NTFY_URL) {
      await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: 'POST',
        headers: {
          Title: 'Focus Block Complete ✅',
          Tags: 'white_check_mark',
          Priority: '2',
        },
        body: `Completed "${label}" — ${durationMin} minutes`,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    return {
      success: true,
      data: {
        label,
        durationMinutes: durationMin,
        endedAt: endTime.toISOString(),
      },
    };
  }
);

/** ─── get_habit_streak ──────────────────────────────────────────── */

const getHabitStreak = createTool(
  {
    name: 'get_habit_streak',
    description: 'Get the current streak count for a tracked daily habit.',
    category: 'productivity',
    tags: ['habit', 'streak'],
    parameters: {
      type: 'object',
      properties: {
        habit: {
          type: 'string',
          description: 'Habit name (e.g. "exercise", "meditation")',
        },
      },
      required: ['habit'],
    },
  },
  async (params) => {
    const habit = (params.habit as string).toLowerCase();
    const entries = habitLog
      .filter((e) => e.habit === habit)
      .map((e) => e.date)
      .sort()
      .reverse();

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (const dateStr of entries) {
      const expectedDate = cursor.toISOString().split('T')[0];
      if (dateStr === expectedDate) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      success: true,
      data: {
        habit,
        streak,
        totalEntries: entries.length,
        lastChecked: entries[0] ?? null,
      },
    };
  }
);

/** ─── check_habit ───────────────────────────────────────────────── */

const checkHabit = createTool(
  {
    name: 'check_habit',
    description: 'Mark a habit as complete for today.',
    category: 'productivity',
    tags: ['habit', 'streak'],
    parameters: {
      type: 'object',
      properties: {
        habit: { type: 'string', description: 'Habit name' },
      },
      required: ['habit'],
    },
  },
  async (params) => {
    const habit = (params.habit as string).toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    const already = habitLog.find((e) => e.habit === habit && e.date === today);
    if (already) {
      return {
        success: true,
        data: {
          message: `Habit "${habit}" already checked for today (${today}).`,
        },
      };
    }

    habitLog.push({ habit, date: today });
    return {
      success: true,
      data: {
        habit,
        date: today,
        message: `Habit "${habit}" checked for ${today}! 🎯`,
      },
    };
  }
);

// Register all productivity tools
const registry = getToolRegistry();
registry.register(createTask);
registry.register(listTasks);
registry.register(updateTask);
registry.register(getTodaysTasks);
registry.register(createNote);
registry.register(listNotes);
registry.register(startFocusBlock);
registry.register(endFocusBlock);
registry.register(getHabitStreak);
registry.register(checkHabit);

export {
  createTask,
  listTasks,
  updateTask,
  getTodaysTasks,
  createNote,
  listNotes,
  startFocusBlock,
  endFocusBlock,
  getHabitStreak,
  checkHabit,
};
