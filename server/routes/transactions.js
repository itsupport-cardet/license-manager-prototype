import { Router } from 'express';
import { z } from 'zod';
import { rematchTransactions, safeJSON } from '../services.js';
import { parseBankLine } from '../lib/match.js';
import { parseDate, todayISO } from '../lib/dates.js';

const ImportRow = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount_eur: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')))),
  card_last4: z.string().nullable().optional(),
  entity_id: z.coerce.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});

export function transactionRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    const { status } = req.query;
    const rows = db.all(`SELECT t.*, s.product, e.name AS entity_name FROM transactions t
      LEFT JOIN subscriptions s ON s.id = t.subscription_id LEFT JOIN entities e ON e.id = t.entity_id
      ${status ? 'WHERE t.match_status = ?' : ''} ORDER BY t.date DESC, t.id DESC`, ...(status ? [status] : []));
    res.json(rows.map((t) => ({ ...t, match_reasons: safeJSON(t.match_reasons, []) })));
  });

  // Import bank/card lines: [{date, description, amount_eur, card_last4?, entity_id?, note?}]
  r.post('/import', (req, res) => {
    const rows = z.array(ImportRow).min(1).max(2000).parse(req.body?.rows);
    const source = `Import ${todayISO()} by ${req.actor}`;
    const errors = [];
    const ids = db.tx(() => rows.flatMap((row, i) => {
      const date = parseDate(row.date) || parseDate(String(row.date).slice(0, 10));
      if (!date) { errors.push(`Row ${i + 1}: unreadable date "${row.date}"`); return []; }
      if (!Number.isFinite(row.amount_eur)) { errors.push(`Row ${i + 1}: unreadable amount`); return []; }
      const parsed = parseBankLine(row.description);
      const dup = db.get('SELECT id FROM transactions WHERE date = ? AND raw_description = ? AND amount_eur = ?', date, row.description, row.amount_eur);
      if (dup) { errors.push(`Row ${i + 1}: duplicate of an existing transaction, skipped`); return []; }
      return [db.insert('transactions', {
        date, raw_description: row.description, amount_eur: row.amount_eur,
        orig_amount: parsed.orig_amount, orig_currency: parsed.orig_currency,
        card_last4: row.card_last4 || parsed.card_last4, entity_id: row.entity_id ?? null, note: row.note ?? null, source,
      })];
    }));
    const m = ids.length ? rematchTransactions(db, ids) : { suggested: 0 };
    db.log(req.actor, 'transaction', null, 'import', `Imported ${ids.length} transactions (${m.suggested} auto-matched)`);
    res.json({ imported: ids.length, suggested: m.suggested, errors });
  });

  r.post('/rematch', (req, res) => res.json(rematchTransactions(db)));

  r.post('/:id/confirm', (req, res) => {
    const id = Number(req.params.id);
    const { subscription_id } = z.object({ subscription_id: z.coerce.number().int().optional() }).parse(req.body || {});
    const tx = db.get('SELECT * FROM transactions WHERE id = ?', id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    const subId = subscription_id ?? tx.subscription_id;
    if (!subId) return res.status(400).json({ error: 'Choose a subscription' });
    db.update('transactions', id, { subscription_id: subId, match_status: 'confirmed', ...(subscription_id && subscription_id !== tx.subscription_id ? { match_reasons: JSON.stringify(['Matched manually']), match_score: null } : {}) });
    db.log(req.actor, 'subscription', subId, 'charge_matched', `Charge of €${tx.amount_eur} on ${tx.date} linked`);
    res.json({ ok: true });
  });

  r.post('/:id/unmatch', (req, res) => {
    db.update('transactions', Number(req.params.id), { subscription_id: null, match_status: 'unmatched', match_score: null, match_reasons: null });
    res.json({ ok: true });
  });

  r.post('/:id/ignore', (req, res) => {
    db.update('transactions', Number(req.params.id), { subscription_id: null, match_status: 'ignored' });
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    db.run('DELETE FROM transactions WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
}
