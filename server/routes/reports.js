import { Router } from 'express';
import { z } from 'zod';
import { dashboard, loadSubscriptions, rematchTransactions } from '../services.js';
import { resetDatabase } from '../seed.js';
import { todayISO } from '../lib/dates.js';

export function reportRoutes(db) {
  const r = Router();

  r.get('/dashboard', (_req, res) => res.json(dashboard(db)));

  r.get('/renewals', (req, res) => {
    const days = Number(req.query.days) || 365;
    const subs = loadSubscriptions(db).filter((s) => ['active', 'trial'].includes(s.status));
    res.json({
      today: todayISO(),
      overdue: subs.filter((s) => s.renewal.state === 'overdue').sort((a, b) => a.renewal.date.localeCompare(b.renewal.date)),
      upcoming: subs.filter((s) => s.renewal.date && s.renewal.days >= 0 && s.renewal.days <= days)
        .sort((a, b) => a.renewal.date.localeCompare(b.renewal.date)),
      unknown: subs.filter((s) => s.renewal.state === 'unknown'),
    });
  });

  r.get('/health', (_req, res) => {
    const subs = loadSubscriptions(db);
    const rows = subs.flatMap((s) => s.health.map((h) => ({ ...h, subscription_id: s.id, product: s.product, status: s.status })));
    const byCode = {};
    for (const h of rows) byCode[h.code] = (byCode[h.code] || 0) + 1;
    const scored = subs.filter((s) => ['active', 'trial'].includes(s.status));
    const clean = scored.filter((s) => !s.health.some((h) => h.severity !== 'info')).length;
    res.json({ issues: rows, byCode, score: scored.length ? Math.round((clean / scored.length) * 100) : 100, clean, total: scored.length });
  });

  r.get('/tasks', (req, res) => {
    const open = req.query.open !== '0';
    res.json(db.all(`SELECT t.*, s.product, p.name AS assignee_name FROM tasks t
      LEFT JOIN subscriptions s ON s.id = t.subscription_id LEFT JOIN people p ON p.id = t.assignee_id
      ${open ? 'WHERE t.done = 0' : ''} ORDER BY t.done, t.due_date IS NULL, t.due_date`));
  });

  r.patch('/tasks/:id', (req, res) => {
    const body = z.object({ done: z.union([z.literal(0), z.literal(1)]).optional(), text: z.string().min(1).optional(),
      due_date: z.string().nullable().optional(), assignee_id: z.coerce.number().int().nullable().optional() }).parse(req.body);
    const t = db.get('SELECT * FROM tasks WHERE id = ?', Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Task not found' });
    db.update('tasks', t.id, body);
    if (body.done != null && t.subscription_id) {
      db.log(req.actor, 'subscription', t.subscription_id, body.done ? 'task_done' : 'task_reopened', t.text);
    }
    res.json({ ok: true });
  });

  r.delete('/tasks/:id', (req, res) => { db.run('DELETE FROM tasks WHERE id = ?', Number(req.params.id)); res.json({ ok: true }); });

  r.patch('/seats/:id', (req, res) => {
    const body = z.object({ revoked: z.boolean() }).parse(req.body);
    const seat = db.get(`SELECT sa.*, p.name FROM seat_assignments sa JOIN people p ON p.id = sa.person_id WHERE sa.id = ?`, Number(req.params.id));
    if (!seat) return res.status(404).json({ error: 'Seat not found' });
    db.update('seat_assignments', seat.id, { revoked_on: body.revoked ? todayISO() : null });
    db.log(req.actor, 'subscription', seat.subscription_id, body.revoked ? 'seat_revoked' : 'seat_restored', `Seat ${body.revoked ? 'revoked from' : 'restored to'} ${seat.name}`);
    res.json({ ok: true });
  });

  r.delete('/seats/:id', (req, res) => { db.run('DELETE FROM seat_assignments WHERE id = ?', Number(req.params.id)); res.json({ ok: true }); });

  r.get('/activity', (_req, res) => {
    res.json(db.all(`SELECT a.*, CASE WHEN a.entity_type = 'subscription' THEN (SELECT product FROM subscriptions WHERE id = a.entity_id) END AS product
      FROM activity_log a ORDER BY a.id DESC LIMIT 200`));
  });

  r.put('/settings', (req, res) => {
    const body = z.object({
      fx_rates: z.record(z.string(), z.coerce.number().positive()).optional(),
      renewal_alert_days: z.coerce.number().int().min(1).max(365).optional(),
    }).parse(req.body);
    db.tx(() => {
      if (body.fx_rates) db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'fx_rates', JSON.stringify(body.fx_rates));
      if (body.renewal_alert_days) db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'renewal_alert_days', String(body.renewal_alert_days));
    });
    if (body.fx_rates) rematchTransactions(db);
    db.log(req.actor, 'settings', null, 'update', JSON.stringify(body));
    res.json({ ok: true });
  });

  r.post('/admin/reset', (req, res) => {
    resetDatabase(db);
    db.log(req.actor, 'system', null, 'reset', 'Demo data reset to the imported spreadsheet');
    res.json({ ok: true });
  });

  r.get('/export/subscriptions.csv', (_req, res) => {
    const subs = loadSubscriptions(db);
    const cols = [
      ['Product', 'product'], ['Vendor', 'vendor_name'], ['Plan', 'plan'], ['Entity', 'entity_name'], ['Status', 'status'],
      ['Departments', (s) => s.departments.join('; ')], ['Owner', 'owner_name'], ['Billing cycle', 'billing_cycle'],
      ['Cost', 'cost_amount'], ['Currency', 'currency'], ['Cost period', 'cost_period'], ['Annual EUR', 'annual_eur'],
      ['Seats purchased', 'seats_purchased'], ['Seats assigned', 'seats_used'], ['Next renewal', (s) => s.renewal.date],
      ['Renewal state', (s) => s.renewal.state], ['Auto renew', (s) => (s.auto_renew == null ? '' : s.auto_renew ? 'Yes' : 'No')],
      ['Payment method', 'payment_label'], ['Account email', 'account_email'], ['Billing email', 'billing_email'],
      ['Discount %', 'discount_pct'], ['Discount note', 'discount_note'], ['Credentials location', 'credentials_location'],
      ['Notes', 'notes_text'],
    ];
    const esc = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [cols.map((c) => c[0]).join(',')];
    for (const s of subs) lines.push(cols.map(([, k]) => esc(typeof k === 'function' ? k(s) : s[k])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subscriptions-${todayISO()}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  });

  return r;
}
