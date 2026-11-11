import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const DEFAULT_PATH = path.join(ROOT, 'data', 'app.db');

/** Thin wrapper around node:sqlite with the handful of helpers the routes need. */
export class DB {
  constructor(file = process.env.DB_PATH || DEFAULT_PATH) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
    this.migrate();
  }

  /** Small in-place migrations for databases created by older versions. */
  migrate() {
    // v0.2: single "notes" text column -> subscription_notes rows (one per line)
    const legacy = this.all(`SELECT id, notes FROM subscriptions WHERE notes IS NOT NULL AND trim(notes) <> ''`);
    if (!legacy.length) return;
    this.tx(() => {
      for (const s of legacy) {
        for (const line of splitNotes(s.notes)) {
          this.run('INSERT INTO subscription_notes (subscription_id, text, author) VALUES (?, ?, ?)', s.id, line, 'Spreadsheet import');
        }
        this.run('UPDATE subscriptions SET notes = NULL WHERE id = ?', s.id);
      }
    });
  }

  all(sql, ...params) { return this.raw.prepare(sql).all(...clean(params)).map(plain); }
  get(sql, ...params) { const r = this.raw.prepare(sql).get(...clean(params)); return r ? plain(r) : null; }
  run(sql, ...params) {
    const r = this.raw.prepare(sql).run(...clean(params));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  }
  exec(sql) { this.raw.exec(sql); }

  tx(fn) {
    this.raw.exec('BEGIN');
    try { const out = fn(this); this.raw.exec('COMMIT'); return out; }
    catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }

  /** Insert an object as a row; unknown keys must not be passed. */
  insert(table, obj) {
    const keys = Object.keys(obj);
    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    return this.run(sql, ...keys.map((k) => obj[k])).id;
  }

  update(table, id, obj) {
    const keys = Object.keys(obj);
    if (!keys.length) return 0;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return this.run(sql, ...keys.map((k) => obj[k]), id).changes;
  }

  setting(key, fallback = null) {
    const r = this.get('SELECT value FROM settings WHERE key = ?', key);
    return r ? r.value : fallback;
  }

  fxRates() {
    try { return JSON.parse(this.setting('fx_rates', '{}')); } catch { return {}; }
  }

  log(actor, entity_type, entity_id, action, summary) {
    this.run('INSERT INTO activity_log (actor, entity_type, entity_id, action, summary) VALUES (?,?,?,?,?)',
      actor || 'system', entity_type, entity_id ?? null, action, summary ?? null);
  }
}

/** The spreadsheet packed several remarks into one cell, separated by line breaks. */
export function splitNotes(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// node:sqlite rejects undefined/booleans; normalise parameters.
function clean(params) {
  return params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}
// rows come back with a null prototype; make them ordinary objects for JSON/spread.
const plain = (r) => ({ ...r });
