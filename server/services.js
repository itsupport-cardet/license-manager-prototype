// Read models shared by routes: enriched subscriptions, data health, dashboard, matching.

import { annualEUR, chargeAmountEUR, round2 } from './lib/money.js';
import { nextRenewal } from './lib/renewals.js';
import { suggestMatches } from './lib/match.js';
import { todayISO } from './lib/dates.js';
import { healthIssues } from './lib/dataHealth.js';

const SUB_SQL = `
  SELECT s.*, v.name AS vendor_name, v.website AS vendor_website, v.match_keywords,
         e.name AS entity_name, pm.label AS payment_label, pm.last4 AS card_last4,
         o.name AS owner_name,
         (SELECT COUNT(*) FROM seat_assignments sa WHERE sa.subscription_id = s.id AND sa.revoked_on IS NULL) AS seats_used,
         (SELECT COUNT(*) FROM tasks t WHERE t.subscription_id = s.id AND t.done = 0) AS open_tasks,
         (SELECT COUNT(*) FROM subscription_notes n WHERE n.subscription_id = s.id) AS notes_count,
         (SELECT group_concat(n.text, ' | ') FROM (SELECT text FROM subscription_notes WHERE subscription_id = s.id ORDER BY id) n) AS notes_text,
         (SELECT group_concat(d.name, '|') FROM subscription_departments sd JOIN departments d ON d.id = sd.department_id
           WHERE sd.subscription_id = s.id) AS dept_names,
         (SELECT group_concat(sd.department_id) FROM subscription_departments sd WHERE sd.subscription_id = s.id) AS dept_ids
  FROM subscriptions s
  JOIN vendors v ON v.id = s.vendor_id
  LEFT JOIN entities e ON e.id = s.entity_id
  LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id
  LEFT JOIN people o ON o.id = s.owner_id`;

export function enrich(row, rates, today = todayISO()) {
  const annual = annualEUR(row, rates);
  const sub = {
    ...row,
    departments: row.dept_names ? row.dept_names.split('|') : [],
    department_ids: row.dept_ids ? String(row.dept_ids).split(',').map(Number) : [],
    review_reasons: safeJSON(row.review_reasons, []),
    annual_eur: round2(annual),
    charge_eur: round2(chargeAmountEUR(row, rates)),
    renewal: nextRenewal(row, today),
  };
  delete sub.dept_names; delete sub.dept_ids;
  delete sub.notes; // legacy column; notes live in subscription_notes (see notes_text / notes_count)
  sub.health = healthIssues(sub);
  return sub;
}

export function loadSubscriptions(db, { where = '', params = [] } = {}) {
  const rates = db.fxRates();
  const today = todayISO();
  return db.all(`${SUB_SQL} ${where} ORDER BY s.product COLLATE NOCASE`, ...params).map((r) => enrich(r, rates, today));
}

export function loadSubscription(db, id) {
  return loadSubscriptions(db, { where: 'WHERE s.id = ?', params: [id] })[0] || null;
}

/** Re-run auto matching on every transaction that is not confirmed/ignored. */
export function rematchTransactions(db, onlyIds = null) {
  const subs = loadSubscriptions(db).map((s) => ({
    id: s.id, status: s.status, plan: s.plan, product: s.product, card_last4: s.card_last4,
    vendor_keywords: (s.match_keywords || '').split(','), expected_charge_eur: s.charge_eur,
  }));
  const txs = db.all(`SELECT * FROM transactions WHERE match_status IN ('unmatched','suggested')`)
    .filter((t) => !onlyIds || onlyIds.includes(t.id));
  let suggested = 0;
  db.tx(() => {
    for (const t of txs) {
      const [best] = suggestMatches(t, subs);
      if (best) {
        suggested++;
        db.update('transactions', t.id, {
          subscription_id: best.subscription_id, match_status: 'suggested',
          match_score: best.score, match_reasons: JSON.stringify(best.reasons),
        });
      } else {
        db.update('transactions', t.id, { subscription_id: null, match_status: 'unmatched', match_score: null, match_reasons: null });
      }
    }
  });
  return { checked: txs.length, suggested };
}

export function dashboard(db) {
  const subs = loadSubscriptions(db);
  const active = subs.filter((s) => s.status === 'active' || s.status === 'trial');
  const sum = (arr) => round2(arr.reduce((a, s) => a + (s.annual_eur || 0), 0));
  const groupBy = (keyFn) => {
    const m = new Map();
    for (const s of active) {
      for (const k of [keyFn(s)].flat()) {
        const key = k || 'Unassigned';
        m.set(key, (m.get(key) || 0) + (s.annual_eur || 0));
      }
    }
    return [...m.entries()].map(([name, value]) => ({ name, value: round2(value) })).filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  };
  // Department spend: split a subscription's cost evenly across its departments.
  const deptMap = new Map();
  for (const s of active) {
    const ds = s.departments.length ? s.departments : ['Unassigned'];
    for (const d of ds) deptMap.set(d, (deptMap.get(d) || 0) + (s.annual_eur || 0) / ds.length);
  }
  const byDepartment = [...deptMap.entries()].map(([name, value]) => ({ name, value: round2(value) }))
    .filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

  const upcoming = active.filter((s) => s.renewal.date && s.renewal.state !== 'overdue')
    .sort((a, b) => a.renewal.date.localeCompare(b.renewal.date)).slice(0, 10);

  // Next 12 months of expected charges (cash-flow view)
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en', { month: 'short', year: '2-digit' }), monthly: 0, renewals: 0 });
  }
  for (const s of active) {
    if (!s.charge_eur) continue;
    if (s.billing_cycle === 'monthly') { months.forEach((m) => { m.monthly += s.charge_eur; }); continue; }
    if (!s.renewal.date) continue;
    const m = months.find((x) => x.key === s.renewal.date.slice(0, 7));
    if (m) m.renewals += s.charge_eur;
  }
  months.forEach((m) => { m.monthly = round2(m.monthly); m.renewals = round2(m.renewals); });

  const tx = db.get(`SELECT SUM(match_status='unmatched') AS unmatched, SUM(match_status='suggested') AS suggested FROM transactions`);
  const openTasks = db.get('SELECT COUNT(*) AS n FROM tasks WHERE done = 0').n;

  return {
    kpis: {
      active: active.length,
      total: subs.length,
      annual_eur: sum(active),
      monthly_eur: round2(sum(active) / 12),
      renewals_30: active.filter((s) => s.renewal.state === 'due_30').length,
      overdue: active.filter((s) => s.renewal.state === 'overdue').length,
      unmatched_tx: tx.unmatched || 0,
      suggested_tx: tx.suggested || 0,
      needs_review: subs.filter((s) => s.health.some((h) => h.severity !== 'info')).length,
      open_tasks: openTasks,
      seats_assigned: active.reduce((a, s) => a + s.seats_used, 0),
    },
    byDepartment,
    byEntity: groupBy((s) => s.entity_name),
    byVendor: groupBy((s) => s.vendor_name).slice(0, 10),
    byCard: groupBy((s) => s.payment_label || 'No payment method'),
    byCycle: groupBy((s) => ({ monthly: 'Monthly', annual: 'Annual', multi_year: 'Multi-year', free: 'Free', custom: 'Custom' }[s.billing_cycle] || 'Unknown')),
    cashflow: months,
    upcoming,
  };
}

export function safeJSON(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
