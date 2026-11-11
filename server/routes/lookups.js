import { Router } from 'express';
import { z } from 'zod';

// Simple CRUD for reference tables used in dropdowns.
const SCHEMAS = {
  entities: z.object({ name: z.string().trim().min(1), notes: z.string().nullable().optional() }),
  departments: z.object({ name: z.string().trim().min(1) }),
  vendors: z.object({ name: z.string().trim().min(1), website: z.string().nullable().optional(), match_keywords: z.string().nullable().optional() }),
  payment_methods: z.object({
    label: z.string().trim().min(1),
    type: z.enum(['card', 'bank_transfer', 'invoice', 'other']).default('card'),
    last4: z.string().regex(/^\d{4}$/, 'Last 4 digits only').nullable().optional().or(z.literal('').transform(() => null)),
    entity_id: z.coerce.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
};
const ORDER = { entities: 'name', departments: 'name', vendors: 'name', payment_methods: 'label' };

export function lookupRoutes(db) {
  const r = Router();

  r.get('/', (_req, res) => {
    const out = {};
    for (const t of Object.keys(SCHEMAS)) out[t] = db.all(`SELECT * FROM ${t} ORDER BY ${ORDER[t]} COLLATE NOCASE`);
    out.people = db.all('SELECT id, name, kind, active, email FROM people ORDER BY kind DESC, name COLLATE NOCASE');
    out.settings = Object.fromEntries(db.all('SELECT key, value FROM settings').map((s) => [s.key, s.value]));
    out.settings.fx_rates = db.fxRates();
    res.json(out);
  });

  const table = (req) => {
    const t = req.params.table;
    if (!SCHEMAS[t]) { const e = new Error('Unknown table'); e.status = 404; e.expose = true; throw e; }
    return t;
  };

  r.post('/:table', (req, res) => {
    const t = table(req);
    const id = db.insert(t, SCHEMAS[t].parse(req.body));
    db.log(req.actor, t, id, 'create', JSON.stringify(req.body));
    res.status(201).json({ id });
  });

  r.put('/:table/:id', (req, res) => {
    const t = table(req);
    db.update(t, Number(req.params.id), SCHEMAS[t].parse(req.body));
    db.log(req.actor, t, Number(req.params.id), 'update', JSON.stringify(req.body));
    res.json({ ok: true });
  });

  r.delete('/:table/:id', (req, res) => {
    const t = table(req);
    if (t === 'vendors') {
      const used = db.get('SELECT COUNT(*) AS n FROM subscriptions WHERE vendor_id = ?', Number(req.params.id)).n;
      if (used) return res.status(409).json({ error: `Vendor is used by ${used} subscription(s)` });
    }
    db.run(`DELETE FROM ${t} WHERE id = ?`, Number(req.params.id));
    db.log(req.actor, t, Number(req.params.id), 'delete', null);
    res.json({ ok: true });
  });

  return r;
}
