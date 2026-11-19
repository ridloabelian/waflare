-- waflare D1 SQLite Schema (Compatible with Cloudflare D1 & SQLite)

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  lead_score INTEGER NOT NULL DEFAULT 0,
  assigned_owner TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  opted_out INTEGER NOT NULL DEFAULT 0,
  last_inbound_at INTEGER NOT NULL DEFAULT 0,
  ctwa_source_id TEXT,
  ctwa_headline TEXT,
  ctwa_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  encrypted_payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_contact_time ON messages(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  title TEXT NOT NULL,
  value_usd REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  name TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en_US',
  category TEXT NOT NULL DEFAULT 'UTILITY',
  status TEXT NOT NULL DEFAULT 'APPROVED',
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_targets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '["*"]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fitness_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  distance_km REAL,
  calories INTEGER,
  weight_kg REAL,
  logged_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_approvals (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  resolved_by TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost_micro_usd INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_traffic_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  path TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  referer TEXT NOT NULL,
  alert_dispatched INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
