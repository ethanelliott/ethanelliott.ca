import { getDb } from '../db/database.js';

export interface AffectResult {
  valence: number;
  arousal: number;
  dominance: number;
  label: string;
  safety_flags: string[];
}

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'happy', 'joy', 'love', 'wonderful', 'amazing',
  'fantastic', 'perfect', 'success', 'win', 'positive', 'benefit', 'helpful',
  'exciting', 'pleased', 'satisfied', 'confident', 'proud', 'calm', 'safe',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'sad', 'hate', 'fear', 'angry', 'worst',
  'horrible', 'failure', 'lose', 'negative', 'harmful', 'useless', 'broken',
  'wrong', 'error', 'problem', 'issue', 'danger', 'risk', 'threat', 'urgent',
]);

const AROUSAL_HIGH = new Set([
  'urgent', 'emergency', 'critical', 'exciting', 'panic', 'alarm', 'rush',
  'important', 'immediately', 'now', 'fast', 'quick', 'alert',
]);

const SAFETY_PATTERNS = [
  { pattern: /\b(kill|harm|hurt|destroy|attack)\b/i, flag: 'potential_harm' },
  { pattern: /\b(die|death|suicide)\b/i, flag: 'distress' },
  { pattern: /\b(urgent|emergency|crisis)\b/i, flag: 'urgency' },
];

export function classifyAffect(text: string): AffectResult {
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);

  let valence = 0;
  let arousalScore = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) valence += 1;
    if (NEGATIVE_WORDS.has(word)) valence -= 1;
    if (AROUSAL_HIGH.has(word)) arousalScore += 1;
  }

  const scale = Math.max(words.length, 1);
  valence = Math.max(-1, Math.min(1, valence / (scale * 0.3)));
  const arousal = Math.max(0, Math.min(1, arousalScore / (scale * 0.2)));
  const dominance = valence > 0 ? 0.6 : valence < 0 ? 0.3 : 0.5;

  const label =
    valence > 0.3 ? (arousal > 0.5 ? 'excited' : 'positive') :
    valence < -0.3 ? (arousal > 0.5 ? 'distressed' : 'negative') :
    'neutral';

  const safety_flags = SAFETY_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ flag }) => flag);

  return { valence, arousal, dominance, label, safety_flags };
}

export interface AffectState {
  valence: number;
  arousal: number;
  dominance: number;
  label: string;
  sample_count: number;
  window_minutes: number;
  safety_flag_counts: Record<string, number>;
}

export interface AffectThreshold {
  id: number;
  agent_id: string;
  metric: string;
  operator: string;
  value: number;
  created_at: string;
}

export interface ThresholdBreach {
  threshold: AffectThreshold;
  current_value: number;
  breached: boolean;
}

function ensureThresholdsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS affect_thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL DEFAULT 'default',
      metric TEXT NOT NULL,
      operator TEXT NOT NULL,
      value REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_affect_thresh_metric_agent
      ON affect_thresholds(metric, agent_id);
  `);
}

export function getAffectState(agentId: string, windowMinutes = 60): AffectState {
  const db = getDb();
  const rows = db.prepare(`
    SELECT valence, arousal, dominance, safety_flags
    FROM affect_log
    WHERE agent_id = ? AND created_at >= datetime('now', ? || ' minutes')
    ORDER BY created_at DESC
  `).all(agentId, `-${windowMinutes}`) as Array<{
    valence: number; arousal: number; dominance: number; safety_flags: string | null;
  }>;

  if (!rows.length) {
    return { valence: 0, arousal: 0, dominance: 0.5, label: 'neutral', sample_count: 0, window_minutes: windowMinutes, safety_flag_counts: {} };
  }

  const avg = (key: 'valence' | 'arousal' | 'dominance') =>
    rows.reduce((s, r) => s + r[key], 0) / rows.length;

  const valence = avg('valence');
  const arousal = avg('arousal');
  const dominance = avg('dominance');

  const label =
    valence > 0.3 ? (arousal > 0.5 ? 'excited' : 'positive') :
    valence < -0.3 ? (arousal > 0.5 ? 'distressed' : 'negative') :
    'neutral';

  const safety_flag_counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.safety_flags) {
      try {
        const flags = JSON.parse(row.safety_flags) as string[];
        for (const f of flags) safety_flag_counts[f] = (safety_flag_counts[f] ?? 0) + 1;
      } catch { /* malformed */ }
    }
  }

  return { valence, arousal, dominance, label, sample_count: rows.length, window_minutes: windowMinutes, safety_flag_counts };
}

export function getAffectHistory(agentId: string, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM affect_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(agentId, limit);
}

export function setThreshold(agentId: string, metric: string, operator: string, value: number): number {
  ensureThresholdsTable();
  const result = getDb().prepare(`
    INSERT INTO affect_thresholds (agent_id, metric, operator, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (metric, agent_id) DO UPDATE SET operator = excluded.operator, value = excluded.value
  `).run(agentId, metric, operator, value);
  return result.lastInsertRowid as number;
}

export function listThresholds(agentId: string): AffectThreshold[] {
  ensureThresholdsTable();
  return getDb().prepare('SELECT * FROM affect_thresholds WHERE agent_id = ? ORDER BY metric')
    .all(agentId) as AffectThreshold[];
}

export function deleteThreshold(agentId: string, id: number): boolean {
  ensureThresholdsTable();
  return getDb().prepare('DELETE FROM affect_thresholds WHERE id = ? AND agent_id = ?')
    .run(id, agentId).changes > 0;
}

export function checkThresholds(agentId: string, windowMinutes = 60): ThresholdBreach[] {
  const state = getAffectState(agentId, windowMinutes);
  const thresholds = listThresholds(agentId);
  const metricValues: Record<string, number> = {
    valence: state.valence,
    arousal: state.arousal,
    dominance: state.dominance,
  };

  return thresholds.map((t) => {
    const current = metricValues[t.metric] ?? 0;
    let breached = false;
    if (t.operator === '>') breached = current > t.value;
    else if (t.operator === '<') breached = current < t.value;
    else if (t.operator === '>=') breached = current >= t.value;
    else if (t.operator === '<=') breached = current <= t.value;
    else if (t.operator === '==' || t.operator === '=') breached = Math.abs(current - t.value) < 0.01;
    return { threshold: t, current_value: current, breached };
  });
}

export function logAffect(text: string, source: string, agentId = 'default'): number {
  const db = getDb();
  const result = classifyAffect(text);

  const row = db.prepare(`
    INSERT INTO affect_log (agent_id, text, source, valence, arousal, dominance, safety_flags)
    VALUES (@agent_id, @text, @source, @valence, @arousal, @dominance, @safety_flags)
  `).run({
    agent_id: agentId,
    text,
    source,
    valence: result.valence,
    arousal: result.arousal,
    dominance: result.dominance,
    safety_flags: result.safety_flags.length ? JSON.stringify(result.safety_flags) : null,
  });

  return row.lastInsertRowid as number;
}
