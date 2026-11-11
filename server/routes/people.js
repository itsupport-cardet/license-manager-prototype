import { Router } from 'express';
import { z } from 'zod';
import { todayISO } from '../lib/dates.js';

const PersonInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  kind: z.enum(['person', 'team']).default('person'),
  department_id: z.coerce.number().int().nullable().optional(),
  active: z.union([z.literal(0), z.literal(1)]).default(1),
  notes: z.string().max(2000).nullable().optional(),
});

export function peopleRoutes(db) {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.all(`SELECT p.*, d.name AS department_name,
        (SELECT COUNT(*) FROM seat_assignments sa JOIN subscriptions s ON s.id = sa.subscription_id
          WHERE sa.person_id = p.id AND sa.revoked_on IS NULL AND s.status IN ('active','trial')) AS active_seats,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.owner_id = p.id AND s.status IN ('active','trial')) AS owned,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = p.id AND t.done = 0) AS open_tasks
      FROM people p LEFT JOIN departments d ON d.id = p.department_id
      ORDER BY p.kind DESC, p.name COLLATE NOCASE`));
  });

  r.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const person = db.get('SELECT p.*, d.name AS department_name FROM people p LEFT JOIN departments d ON d.id = p.department_id WHERE p.id = ?', id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    person.seats = db.all(`SELECT sa.*, s.product, s.plan, s.status AS sub_status, s.id AS subscription_id
      FROM seat_assignments sa JOIN subscriptions s ON s.id = sa.subscription_id
      WHERE sa.person_id = ? ORDER BY sa.revoked_on IS NOT NULL, s.product`, id);
    person.owned = db.all(`SELECT id, product, plan, status FROM subscriptions WHERE owner_id = ? ORDER BY product`, id);
    person.tasks = db.all(`SELECT t.*, s.product FROM tasks t LEFT JOIN subscriptions s ON s.id = t.subscription_id
      WHERE t.assignee_id = ? ORDER BY t.done, t.due_date`, id);
    res.json(person);
  });

  r.post('/', (req, res) => {
    const p = PersonInput.parse(req.body);
    const id = db.insert('people', p);
    db.log(req.actor, 'person', id, 'create', `Added ${p.name}`);
    res.status(201).json({ id });
  });

  r.put('/:id', (req, res) => {
    const p = PersonInput.parse(req.body);
    db.update('people', Number(req.params.id), p);
    db.log(req.actor, 'person', Number(req.params.id), 'update', `Updated ${p.name}`);
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const p = db.get('SELECT name FROM people WHERE id = ?', id);
    db.run('DELETE FROM people WHERE id = ?', id);
    db.log(req.actor, 'person', id, 'delete', `Deleted ${p?.name}`);
    res.json({ ok: true });
  });

  // Offboarding: revoke every active seat, mark inactive, list subscriptions they still own.
  r.post('/:id/offboard', (req, res) => {
    const id = Number(req.params.id);
    const p = db.get('SELECT name FROM people WHERE id = ?', id);
    if (!p) return res.status(404).json({ error: 'Person not found' });
    const result = db.tx(() => {
      const seats = db.all(`SELECT sa.id, sa.subscription_id, s.product FROM seat_assignments sa
        JOIN subscriptions s ON s.id = sa.subscription_id WHERE sa.person_id = ? AND sa.revoked_on IS NULL`, id);
      for (const s of seats) {
        db.update('seat_assignments', s.id, { revoked_on: todayISO() });
        db.log(req.actor, 'subscription', s.subscription_id, 'seat_revoked', `Seat revoked from ${p.name} (offboarding)`);
      }
      db.update('people', id, { active: 0 });
      db.log(req.actor, 'person', id, 'offboard', `Offboarded ${p.name}: ${seats.length} seats revoked`);
      const owned = db.all(`SELECT id, product FROM subscriptions WHERE owner_id = ? AND status IN ('active','trial')`, id);
      return { revoked: seats.map((s) => s.product), still_owner_of: owned };
    });
    res.json(result);
  });

  return r;
}
