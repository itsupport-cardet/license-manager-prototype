import { addMonths, daysBetween, todayISO } from './dates.js';

export function cycleMonths(sub) {
  if (sub.billing_cycle === 'monthly') return 1;
  if (sub.billing_cycle === 'annual') return 12;
  if (sub.billing_cycle === 'multi_year') return sub.cycle_months || null;
  return null;
}

/**
 * Effective next renewal of a subscription.
 * - Inactive and free subscriptions have no renewal.
 * - Auto-renewing (and monthly) subscriptions with a past date roll forward by the cycle.
 * - Others with a past date are 'overdue': someone must confirm what happened.
 *
 * Returns { date, state, days, rolled }
 *   state: 'none' | 'unknown' | 'overdue' | 'due_30' | 'due_60' | 'due_90' | 'later'
 */
export function nextRenewal(sub, today = todayISO()) {
  if (sub.status !== 'active' || sub.billing_cycle === 'free') {
    return { date: null, state: 'none', days: null, rolled: false };
  }
  const months = cycleMonths(sub);
  let date = sub.next_renewal_date;
  if (!date && sub.last_renewal_date && months) date = addMonths(sub.last_renewal_date, months);
  if (!date) return { date: null, state: 'unknown', days: null, rolled: false };

  let rolled = false;
  const autoRolls = Number(sub.auto_renew) === 1 || sub.billing_cycle === 'monthly';
  if (date < today && autoRolls && months) {
    let guard = 0;
    while (date < today && guard++ < 600) date = addMonths(date, months);
    rolled = true;
  }

  const days = daysBetween(today, date);
  let state;
  if (days < 0) state = 'overdue';
  else if (days <= 30) state = 'due_30';
  else if (days <= 60) state = 'due_60';
  else if (days <= 90) state = 'due_90';
  else state = 'later';
  return { date, state, days, rolled };
}
