// Load seed/data.json into the database.
//   node server/seed.js --reset   -> wipe and reseed
// The server also calls seedIfEmpty() on boot, so a fresh Render instance always has demo data.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB, ROOT, splitNotes } from './db.js';
import { rematchTransactions } from './services.js';

const SEED_FILE = path.join(ROOT, 'seed', 'data.json');
const TABLES = ['activity_log', 'subscription_notes', 'tasks', 'transactions', 'seat_assignments', 'subscription_departments',
  'subscriptions', 'people', 'payment_methods', 'vendors', 'departments', 'entities', 'settings'];

export function resetDatabase(db) {
  db.tx(() => { for (const t of TABLES) db.exec(`DELETE FROM ${t}`); });
  seed(db);
}

export function seedIfEmpty(db) {
  const { n } = db.get('SELECT COUNT(*) AS n FROM subscriptions');
  if (n === 0) { seed(db); return true; }
  return false;
}

export function seed(db) {
  const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  db.tx(() => {
    const ids = { entity: {}, dept: {}, person: {}, pm: {}, vendor: {}, sub: {} };

    for (const e of data.entities) ids.entity[e.name] = db.insert('entities', { name: e.name, notes: e.notes ?? null });
    for (const d of data.departments) ids.dept[d] = db.insert('departments', { name: d });
    for (const p of data.people) {
      ids.person[p.name] = db.insert('people', { name: p.name, email: p.email ?? null, kind: p.kind || 'person', notes: p.notes ?? null });
    }
    for (const p of data.payment_methods) {
      ids.pm[p.label] = db.insert('payment_methods', {
        label: p.label, type: p.type, last4: p.last4 ?? null, entity_id: ids.entity[p.entity] ?? null, notes: p.notes ?? null,
      });
    }
    for (const v of data.vendors) ids.vendor[v.name] = db.insert('vendors', v);

    for (const s of data.subscriptions) {
      if (!ids.vendor[s.vendor]) ids.vendor[s.vendor] = db.insert('vendors', { name: s.vendor });
      const id = db.insert('subscriptions', {
        vendor_id: ids.vendor[s.vendor], product: s.product, plan: s.plan, entity_id: ids.entity[s.entity] ?? null,
        status: s.status, account_name: s.account_name, account_email: s.account_email, customer_id: s.customer_id,
        billing_email: s.billing_email, billing_cycle: s.billing_cycle, cycle_months: s.cycle_months,
        cost_amount: s.cost_amount, currency: s.currency, cost_period: s.cost_period, seats_purchased: s.seats_purchased,
        last_invoice_no: s.last_invoice_no, last_invoice_date: s.last_invoice_date, last_renewal_date: s.last_renewal_date,
        next_renewal_date: s.next_renewal_date, auto_renew: s.auto_renew, payment_method_id: ids.pm[s.payment_method] ?? null,
        discount_pct: s.discount_pct, discount_note: s.discount_note, credentials_location: s.credentials_location,
        description: s.description, owner_id: ids.person[s.owner] ?? null,
        needs_review: s.review_reasons?.length ? 1 : 0, review_reasons: JSON.stringify(s.review_reasons || []),
        cancelled_on: s.cancelled_on,
      });
      ids.sub[s.key] = id;
      for (const text of splitNotes(s.notes)) db.insert('subscription_notes', { subscription_id: id, text, author: 'Spreadsheet import' });
      for (const d of s.departments || []) db.insert('subscription_departments', { subscription_id: id, department_id: ids.dept[d] });
      for (const seat of s.seats || []) {
        db.insert('seat_assignments', { subscription_id: id, person_id: ids.person[seat.person], assigned_on: null, notes: seat.notes ?? null });
      }
    }

    for (const t of data.tasks) {
      db.insert('tasks', { subscription_id: ids.sub[t.sub] ?? null, text: t.text, assignee_id: ids.person[t.assignee] ?? null, due_date: t.due ?? null });
    }
    for (const t of data.transactions) {
      db.insert('transactions', {
        date: t.date, raw_description: t.raw_description, amount_eur: t.amount_eur, orig_amount: t.orig_amount,
        orig_currency: t.orig_currency, card_last4: t.card_last4, entity_id: ids.entity[t.entity] ?? null, note: t.note, source: t.source,
      });
    }
    for (const [key, value] of Object.entries(data.settings)) db.insert('settings', { key, value: String(value) });
    db.log('system', 'system', null, 'seed', `Loaded demo data from ${data.source}`);
  });
  rematchTransactions(db);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new DB();
  if (process.argv.includes('--reset')) resetDatabase(db); else seedIfEmpty(db);
  const c = (t) => db.get(`SELECT COUNT(*) AS n FROM ${t}`).n;
  console.log(`DB ${db.file}`);
  console.log(`  subscriptions ${c('subscriptions')}, people ${c('people')}, entities ${c('entities')}, payment methods ${c('payment_methods')}`);
  console.log(`  seats ${c('seat_assignments')}, transactions ${c('transactions')}, tasks ${c('tasks')}`);
  const m = db.all('SELECT match_status, COUNT(*) AS n FROM transactions GROUP BY 1');
  console.log('  transaction matches:', m.map((r) => `${r.match_status}=${r.n}`).join(', '));
}
