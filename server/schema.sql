PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entities (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS people (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  email         TEXT,
  kind          TEXT NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'team')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id        INTEGER PRIMARY KEY,
  label     TEXT NOT NULL UNIQUE,
  type      TEXT NOT NULL DEFAULT 'card' CHECK (type IN ('card', 'bank_transfer', 'invoice', 'other')),
  last4     TEXT,
  entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  website        TEXT,
  match_keywords TEXT  -- comma separated, used to match bank lines
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   INTEGER PRIMARY KEY,
  vendor_id            INTEGER NOT NULL REFERENCES vendors(id),
  product              TEXT NOT NULL,          -- display name, e.g. "OpenAI / ChatGPT (Team)"
  plan                 TEXT,
  entity_id            INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'inactive', 'cancelled')),
  account_name         TEXT,
  account_email        TEXT,
  customer_id          TEXT,
  billing_email        TEXT,
  billing_cycle        TEXT CHECK (billing_cycle IN ('monthly', 'annual', 'multi_year', 'free', 'custom')),
  cycle_months         INTEGER,
  cost_amount          REAL,
  currency             TEXT DEFAULT 'EUR',
  cost_period          TEXT CHECK (cost_period IN ('month', 'year', 'term')),
  seats_purchased      INTEGER,
  last_invoice_no      TEXT,
  last_invoice_date    TEXT,
  last_renewal_date    TEXT,
  next_renewal_date    TEXT,
  auto_renew           INTEGER,                -- 1 yes, 0 no, NULL unknown
  payment_method_id    INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  discount_pct         REAL,
  discount_note        TEXT,
  credentials_location TEXT,                   -- where credentials live (e.g. Snipe-IT). Never passwords.
  description          TEXT,
  notes                TEXT,
  owner_id             INTEGER REFERENCES people(id) ON DELETE SET NULL,
  needs_review         INTEGER NOT NULL DEFAULT 0,
  review_reasons       TEXT,                   -- JSON array of strings
  cancelled_on         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_departments (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  department_id   INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (subscription_id, department_id)
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  person_id       INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  assigned_on     TEXT,
  revoked_on      TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_seats_sub ON seat_assignments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_seats_person ON seat_assignments(person_id);

CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY,
  date             TEXT NOT NULL,
  raw_description  TEXT NOT NULL,
  amount_eur       REAL,
  orig_amount      REAL,
  orig_currency    TEXT,
  card_last4       TEXT,
  entity_id        INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  subscription_id  INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  match_status     TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'suggested', 'confirmed', 'ignored')),
  match_score      INTEGER,
  match_reasons    TEXT,                       -- JSON array
  note             TEXT,
  source           TEXT,                       -- e.g. "AI sheet", "CSV import 2026-11-11"
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_sub ON transactions(subscription_id);

-- Any number of notes per subscription (subscriptions.notes is a legacy column, migrated here on boot).
CREATE TABLE IF NOT EXISTS subscription_notes (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  author          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_notes_sub ON subscription_notes(subscription_id);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  assignee_id     INTEGER REFERENCES people(id) ON DELETE SET NULL,
  due_date        TEXT,
  done            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  action      TEXT NOT NULL,
  summary     TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_entity ON activity_log(entity_type, entity_id);
