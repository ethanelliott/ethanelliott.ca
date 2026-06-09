-- Core memory store
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  memory_type TEXT NOT NULL DEFAULT 'episodic',
  scope TEXT NOT NULL DEFAULT 'global',
  replay_priority REAL NOT NULL DEFAULT 0.0,
  ripple_tags INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  retired_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_retired ON memories(retired_at);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  category,
  tags,
  content='memories',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, COALESCE(old.tags, ''));
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, COALESCE(new.tags, ''));
END;

-- Named entities with compiled understanding
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'concept',
  properties TEXT,
  observations TEXT,
  compiled_truth TEXT,
  tier INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_name_agent ON entities(name, agent_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  name,
  entity_type,
  observations,
  compiled_truth,
  content='entities',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, name, entity_type, observations, compiled_truth)
  VALUES (new.id, new.name, new.entity_type, COALESCE(new.observations, ''), COALESCE(new.compiled_truth, ''));
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, entity_type, observations, compiled_truth)
  VALUES ('delete', old.id, old.name, old.entity_type, COALESCE(old.observations, ''), COALESCE(old.compiled_truth, ''));
  INSERT INTO entities_fts(rowid, name, entity_type, observations, compiled_truth)
  VALUES (new.id, new.name, new.entity_type, COALESCE(new.observations, ''), COALESCE(new.compiled_truth, ''));
END;

-- Directed, typed relationships between any records
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON knowledge_edges(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON knowledge_edges(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON knowledge_edges(relation);

-- Append-only event log
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  summary TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'observation',
  project TEXT,
  importance REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  summary,
  event_type,
  project,
  content='events',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, summary, event_type, project)
  VALUES (new.id, new.summary, new.event_type, COALESCE(new.project, ''));
END;

-- Decisions with rationale
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  project TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_agent ON decisions(agent_id);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project);

-- Prospective memory triggers
CREATE TABLE IF NOT EXISTS triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  condition TEXT NOT NULL,
  keywords TEXT NOT NULL,
  action TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  expires TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fired_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_triggers_agent ON triggers(agent_id);
CREATE INDEX IF NOT EXISTS idx_triggers_active ON triggers(active);

-- Session handoff packets
CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  goal TEXT NOT NULL,
  current_state TEXT NOT NULL,
  open_loops TEXT NOT NULL,
  next_step TEXT NOT NULL,
  project TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_handoffs_agent ON handoffs(agent_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_project ON handoffs(project);
CREATE INDEX IF NOT EXISTS idx_handoffs_consumed ON handoffs(consumed_at);

-- Structured procedures / workflows
CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  goal TEXT NOT NULL,
  title TEXT,
  description TEXT NOT NULL DEFAULT '',
  steps TEXT,
  procedure_kind TEXT NOT NULL DEFAULT 'workflow',
  scope TEXT NOT NULL DEFAULT 'global',
  category TEXT NOT NULL DEFAULT 'convention',
  confidence REAL NOT NULL DEFAULT 0.9,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_procedures_agent ON procedures(agent_id);
CREATE INDEX IF NOT EXISTS idx_procedures_status ON procedures(status);
CREATE INDEX IF NOT EXISTS idx_procedures_scope ON procedures(scope);

CREATE VIRTUAL TABLE IF NOT EXISTS procedures_fts USING fts5(
  goal,
  title,
  description,
  content='procedures',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS procedures_ai AFTER INSERT ON procedures BEGIN
  INSERT INTO procedures_fts(rowid, goal, title, description)
  VALUES (new.id, new.goal, COALESCE(new.title, ''), new.description);
END;

CREATE TRIGGER IF NOT EXISTS procedures_au AFTER UPDATE ON procedures BEGIN
  INSERT INTO procedures_fts(procedures_fts, rowid, goal, title, description)
  VALUES ('delete', old.id, old.goal, COALESCE(old.title, ''), old.description);
  INSERT INTO procedures_fts(rowid, goal, title, description)
  VALUES (new.id, new.goal, COALESCE(new.title, ''), new.description);
END;

-- Procedure execution feedback
CREATE TABLE IF NOT EXISTS procedure_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedure_id INTEGER NOT NULL REFERENCES procedures(id),
  success INTEGER NOT NULL DEFAULT 0,
  usefulness_score REAL,
  outcome_summary TEXT,
  errors_seen TEXT,
  validated INTEGER NOT NULL DEFAULT 0,
  task_signature TEXT,
  input_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_procedure ON procedure_feedback(procedure_id);

-- Per-agent key-value state
CREATE TABLE IF NOT EXISTS agent_state (
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, key)
);

-- Affect / emotional valence log
CREATE TABLE IF NOT EXISTS affect_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT 'default',
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'observation',
  valence REAL NOT NULL DEFAULT 0.0,
  arousal REAL NOT NULL DEFAULT 0.0,
  dominance REAL NOT NULL DEFAULT 0.0,
  safety_flags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affect_agent ON affect_log(agent_id);
