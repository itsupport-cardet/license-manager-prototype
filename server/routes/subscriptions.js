import { Router } from 'express';
import { z } from 'zod';
import { loadSubscriptions, loadSubscription, safeJSON } from '../services.js';
import { todayISO, addMonths } from '../lib/dates.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional();
const optStr = z.string().trim().max(2000).nullable().optional().transform((v) => (v === '' ? null : v));
const optId = z.coerce.number().int().positive().nullable().optional();

export const SubscriptionInput = z.object({
  vendor_id: optId,
  vendor_name: optStr, // create the vendor on the fly
  product: z.string().trim().min(1, 'Required').max(200),
  plan: optStr,
  entity_id: optId,
  status: z.enum(['active', 'trial', 'inactive', 'cancelled']).default('active'),
  account_name: optStr,
  account_email: optStr,
  customer_id: optStr,
  billing_email: optStr,
  billing_cycle: z.enum(['monthly', 'annual', 'multi_year', 'free', 'custom']).nullable().optional(),
  cycle_months: z.coerce.number().int().min(1).max(120).nullable().optional(),
  cost_amount: z.coerce.number().min(0).nullable().optional(),
  currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
  cost_period: z.enum(['month', 'year', 'term']).nullable().optional(),
  seats_purchased: z.coerce.number().int().min(0).nullable().optional(),
  last_invoice_no: optStr,
  last_invoice_date: isoDate,
  last_renewal_date: isoDate,
  next_renewal_date: isoDate,
  auto_renew: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  payment_method_id: optId,
  discount_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  discount_note: optStr,
  credentials_location: optStr,
  description: optStr,
  initial_note: optStr, // optional first note when creating
  owner_id: optId,
  department_ids: z.array(z.coerce.number().int()).default([]),
  needs_review: z.union([z.literal(0), z.literal(1)]).optional(),
  review_reasons: z.array(z.string()).optional(),
  cancelled_on: isoDate,
});

const FIELDS = ['vendor_id', 'product', 'plan', 'entity_id', 'status', 'account_name', 'account_email', 'customer_id',
  'billing_email', 'billing_cycle', 'cycle_months', 'cost_amount', 'currency', 'cost_period', 'seats_purchased',
  'last_invoice_no', 'last_invoice_date', 'last_renewal_date', 'next_renewal_date', 'auto_renew', 'payment_method_id',
  'discount_pct', 'discount_note', 'credentials_location', 'description', 'owner_id', 'cancelled_on'];

function notFound() { const e = new Error('Subscription not found'); e.status = 404; e.expose = true; return e; }

export function subscriptionRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    let subs = loadSubscriptions(db);
    const { q, status, entity_id, department_id, payment_method_id, cycle, renewal } = req.query;
    if (q) {
      const needle = String(q).toLowerCase();
      subs = subs.filter((s) => [s.product, s.vendor_name, s.plan, s.owner_name, s.description, s.notes_text, s.account_email]
        .some((f) => f && f.toLowerCase().includes(needle)));
    }
    if (status) subs = subs.filter((s) => String(status).split(',').includes(s.status));
    if (entity_id) subs = subs.filter((s) => s.entity_id === Number(entity_id));
    if (department_id) subs = subs.filter((s) => s.department_ids.includes(Number(department_id)));
    if (payment_method_id) subs = subs.filter((s) => s.payment_method_id === Number(payment_method_id));
    if (cycle) subs = subs.filter((s) => s.billing_cycle === cycle);
    if (renewal) subs = subs.filter((s) => String(renewal).split(',').includes(s.renewal.state));
    res.json(subs);
  });

  r.get('/:id', (req, res) => {
    const sub = loadSubscription(db, Number(req.params.id));
    if (!sub) throw notFound();
    const id = sub.id;
    sub.seats = db.all(`SELECT sa.*, p.name AS person_name, p.email AS person_email, p.kind, p.active AS person_active
      FROM seat_assignments sa JOIN people p ON p.id = sa.person_id WHERE sa.subscription_id = ?
      ORDER BY sa.revoked_on IS NOT NULL, p.name`, id);
    sub.transactions = db.all('SELECT * FROM transactions WHERE subscription_id = ? ORDER BY date DESC', id)
      .map((t) => ({ ...t, match_reasons: safeJSON(t.match_reasons, []) }));
    sub.tasks = db.all(`SELECT t.*, p.name AS assignee_name FROM tasks t LEFT JOIN people p ON p.id = t.assignee_id
      WHERE t.subscription_id = ? ORDER BY t.done, t.due_date IS NULL, t.due_date`, id);
    sub.notes = db.all('SELECT * FROM subscription_notes WHERE subscription_id = ? ORDER BY created_at DESC, id DESC', id);
    sub.activity = db.all(`SELECT * FROM activity_log WHERE entity_type = 'subscription' AND entity_id = ? ORDER BY id DESC LIMIT 100`, id);
    res.json(sub);
  });

  const save = (req, id = null) => {
    const input = SubscriptionInput.parse(req.body);
    return db.tx(() => {
      if (!input.vendor_id) {
        const name = input.vendor_name || input.product;
        const existing = db.get('SELECT id FROM vendors WHERE name = ? COLLATE NOCASE', name);
        input.vendor_id = existing ? existing.id : db.insert('vendors', { name, match_keywords: name.toUpperCase() });
      }
      if (input.billing_cycle === 'monthly') input.cycle_months = 1;
      if (input.billing_cycle === 'annual') input.cycle_months = 12;
      if (input.status === 'cancelled' && !input.cancelled_on) input.cancelled_on = todayISO();

      const row = Object.fromEntries(FIELDS.filter((f) => f in input).map((f) => [f, input[f]]));
      if (input.review_reasons) {
        row.review_reasons = JSON.stringify(input.review_reasons);
        row.needs_review = input.review_reasons.length ? 1 : 0;
      }
      let changed = [];
      if (id) {
        const before = db.get('SELECT * FROM subscriptions WHERE id = ?', id);
        if (!before) throw notFound();
        changed = Object.keys(row).filter((k) => String(before[k] ?? '') !== String(row[k] ?? ''));
        db.update('subscriptions', id, { ...row, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
        db.log(req.actor, 'subscription', id, 'update', changed.length ? `Changed ${changed.join(', ')}` : 'Saved (no field changes)');
      } else {
        id = db.insert('subscriptions', row);
        db.log(req.actor, 'subscription', id, 'create', `Created ${row.product}`);
        if (input.initial_note) db.insert('subscription_notes', { subscription_id: id, text: input.initial_note, author: req.actor });
      }
      db.run('DELETE FROM subscription_departments WHERE subscription_id = ?', id);
      for (const d of input.department_ids) db.insert('subscription_departments', { subscription_id: id, department_id: d });
      return id;
    });
  };

  r.post('/', (req, res) => res.status(201).json(loadSubscription(db, save(req))));
  r.put('/:id', (req, res) => res.json(loadSubscription(db, save(req, Number(req.params.id)))));

  // Partial update (e.g. { status: 'cancelled' } or { review_reasons: [] }): merge onto the stored row.
  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const before = db.get('SELECT * FROM subscriptions WHERE id = ?', id);
    if (!before) throw notFound();
    const current = Object.fromEntries(FIELDS.map((f) => [f, before[f]]));
    current.review_reasons = safeJSON(before.review_reasons, []);
    current.department_ids = db.all('SELECT department_id FROM subscription_departments WHERE subscription_id = ?', id).map((d) => d.department_id);
    req.body = { ...current, ...req.body };
    res.json(loadSubscription(db, save(req, id)));
  });

  r.delete('/:id', (req, res) => {
    const sub = db.get('SELECT product FROM subscriptions WHERE id = ?', Number(req.params.id));
    if (!sub) throw notFound();
    db.run('DELETE FROM subscriptions WHERE id = ?', Number(req.params.id));
    db.log(req.actor, 'subscription', Number(req.params.id), 'delete', `Deleted ${sub.product}`);
    res.json({ ok: true });
  });

  // Mark the renewal as done: move the dates one cycle forward
  r.post('/:id/renewed', (req, res) => {
    const sub = loadSubscription(db, Number(req.params.id));
    if (!sub) throw notFound();
    const body = z.object({ next_renewal_date: isoDate, cost_amount: z.coerce.number().nullable().optional(), invoice_no: optStr }).parse(req.body || {});
    const months = sub.billing_cycle === 'monthly' ? 1 : sub.cycle_months || 12;
    const from = sub.renewal.date || sub.next_renewal_date || todayISO();
    const next = body.next_renewal_date || addMonths(from, months);
    db.update('subscriptions', sub.id, {
      last_renewal_date: from, next_renewal_date: next,
      ...(body.cost_amount != null ? { cost_amount: body.cost_amount } : {}),
      ...(body.invoice_no ? { last_invoice_no: body.invoice_no, last_invoice_date: todayISO() } : {}),
    });
    db.log(req.actor, 'subscription', sub.id, 'renewed', `Marked renewed on ${from}; next renewal ${next}`);
    res.json(loadSubscription(db, sub.id));
  });

  // Seats
  r.post('/:id/seats', (req, res) => {
    const { person_id, notes } = z.object({ person_id: z.coerce.number().int(), notes: optStr }).parse(req.body);
    const id = Number(req.params.id);
    const dup = db.get('SELECT id FROM seat_assignments WHERE subscription_id = ? AND person_id = ? AND revoked_on IS NULL', id, person_id);
    if (dup) return res.status(409).json({ error: 'This person already has an active seat' });
    db.insert('seat_assignments', { subscription_id: id, person_id, assigned_on: todayISO(), notes: notes ?? null });
    const p = db.get('SELECT name FROM people WHERE id = ?', person_id);
    db.log(req.actor, 'subscription', id, 'seat_assigned', `Seat assigned to ${p?.name}`);
    res.status(201).json({ ok: true });
  });

  // Notes: any number per subscription
  const NoteInput = z.object({ text: z.string().trim().min(1, 'Note is empty').max(5000) });
  const getNote = (req) => {
    const note = db.get('SELECT * FROM subscription_notes WHERE id = ? AND subscription_id = ?', Number(req.params.noteId), Number(req.params.id));
    if (!note) { const e = new Error('Note not found'); e.status = 404; e.expose = true; throw e; }
    return note;
  };
  const preview = (t) => (t.length > 80 ? `${t.slice(0, 80)}…` : t);

  r.post('/:id/notes', (req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT id FROM subscriptions WHERE id = ?', id)) throw notFound();
    const { text } = NoteInput.parse(req.body);
    const noteId = db.insert('subscription_notes', { subscription_id: id, text, author: req.actor });
    db.log(req.actor, 'subscription', id, 'note_added', `Note: ${preview(text)}`);
    res.status(201).json(db.get('SELECT * FROM subscription_notes WHERE id = ?', noteId));
  });

  r.put('/:id/notes/:noteId', (req, res) => {
    const note = getNote(req);
    const { text } = NoteInput.parse(req.body);
    db.update('subscription_notes', note.id, { text, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
    db.log(req.actor, 'subscription', note.subscription_id, 'note_edited', `Note edited: ${preview(text)}`);
    res.json(db.get('SELECT * FROM subscription_notes WHERE id = ?', note.id));
  });

  r.delete('/:id/notes/:noteId', (req, res) => {
    const note = getNote(req);
    db.run('DELETE FROM subscription_notes WHERE id = ?', note.id);
    db.log(req.actor, 'subscription', note.subscription_id, 'note_deleted', `Note deleted: ${preview(note.text)}`);
    res.json({ ok: true });
  });

  // Tasks
  r.post('/:id/tasks', (req, res) => {
    const t = z.object({ text: z.string().trim().min(1), assignee_id: optId, due_date: isoDate }).parse(req.body);
    const id = db.insert('tasks', { subscription_id: Number(req.params.id), text: t.text, assignee_id: t.assignee_id ?? null, due_date: t.due_date ?? null });
    db.log(req.actor, 'subscription', Number(req.params.id), 'task_added', t.text);
    res.status(201).json({ id });
  });

  return r;
}

