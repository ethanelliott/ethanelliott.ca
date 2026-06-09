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
