// Cost parsing and normalisation.
//
// A subscription stores cost_amount + currency + cost_period:
//   'month' -> amount is charged per month
//   'year'  -> amount is the yearly total
//   'term'  -> amount covers the whole multi-year term (term length = cycle_months)
// billing_cycle says how often it renews: monthly | annual | multi_year | free | custom.

/** "Monthly" / "Annual" / "Yearly" / "Two years" / "27 months" -> { cycle, months } */
export function parseCycle(text) {
  const none = { cycle: null, months: null };
  if (text == null) return none;
  const s = String(text).trim().toLowerCase();
  if (!s) return none;
  if (/^month/.test(s)) return { cycle: 'monthly', months: 1 };
  if (/^(annual|yearly|year)/.test(s)) return { cycle: 'annual', months: 12 };
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  let m = s.match(/^(\d+|one|two|three|four|five)\s*years?/);
  if (m) {
    const n = words[m[1]] ?? Number(m[1]);
    return n === 1 ? { cycle: 'annual', months: 12 } : { cycle: 'multi_year', months: n * 12 };
  }
  m = s.match(/^(\d+)\s*months?/);
  if (m) {
    const n = Number(m[1]);
    if (n === 1) return { cycle: 'monthly', months: 1 };
    if (n === 12) return { cycle: 'annual', months: 12 };
    return { cycle: 'multi_year', months: n };
  }
  return none;
}

function detectCurrency(s) {
  if (/€|eur/i.test(s)) return 'EUR';
  if (/\$|usd/i.test(s)) return 'USD';
  if (/£|gbp/i.test(s)) return 'GBP';
  return null;
}

function toNumber(str) {
  // "3,140.00" -> 3140 ; "16,00" -> 16
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) return Number(str.replace(/,/g, ''));
  return Number(str.replace(',', '.'));
}

/**
 * Parse the free-text "Total Amount" cell.
 * Returns { amount, currency, period, seats, kind, assumptions[] }
 *   kind: 'paid' | 'free' | 'custom' | 'unknown'
 */
export function parseCost(value, cycleMonths = null) {
  const out = { amount: null, currency: null, period: null, seats: null, kind: 'unknown', assumptions: [] };
  const defaultPeriod = () => (cycleMonths === 1 ? 'month' : cycleMonths && cycleMonths > 12 ? 'term' : 'year');

  if (value == null || value === '') return out;

  if (typeof value === 'number') {
    if (value === 0) {
      out.amount = 0; out.currency = 'EUR'; out.period = 'year'; out.kind = 'free';
      out.assumptions.push('Amount is 0 in source sheet');
      return out;
    }
    out.amount = value; out.currency = 'EUR'; out.period = defaultPeriod(); out.kind = 'paid';
    out.assumptions.push('Currency not stated, assumed EUR');
    if (!cycleMonths) out.assumptions.push('Billing period not stated, assumed yearly');
    return out;
  }

  const s = String(value).trim();
  if (/^(free|included)/i.test(s)) return { ...out, amount: 0, currency: 'EUR', period: 'year', kind: 'free' };
  if (/^custom/i.test(s)) return { ...out, kind: 'custom' };

  const first = s.match(/([€$£])?\s*(\d[\d,]*(?:\.\d+)?)\s*(usd|eur|gbp)?\s*(\/\s*(yr|year|mo|month))?/i);
  if (!first) return out;
  out.amount = toNumber(first[2]);
  out.kind = 'paid';
  out.currency = detectCurrency((first[1] || '') + (first[3] || '')) || detectCurrency(s);
  if (!out.currency) { out.currency = 'EUR'; out.assumptions.push('Currency not stated, assumed EUR'); }

  const rest = s.slice(first.index + first[0].length);
  const seats = rest.match(/x\s*(\d+)/i);
  if (seats) out.seats = Number(seats[1]);

  if (first[5]) out.period = /^y/i.test(first[5]) ? 'year' : 'month';
  else if (/\/\s*mo/i.test(rest)) out.period = 'year'; // "$192.00 ($16/mo)": 192 is the yearly total
  else out.period = defaultPeriod();
  return out;
}

/** Annualised cost in the subscription's own currency. */
export function annualize(amount, period, cycleMonths) {
  if (amount == null) return null;
  switch (period) {
    case 'month': return amount * 12;
    case 'term': return cycleMonths ? (amount * 12) / cycleMonths : amount;
    default: return amount;
  }
}

/** Convert to EUR using rates like { USD: 0.89 } (1 unit of currency -> EUR). */
export function toEUR(amount, currency, rates = {}) {
  if (amount == null) return null;
  if (!currency || currency === 'EUR') return amount;
  const r = rates[currency];
  return r ? amount * r : null;
}

/** Annual cost of a subscription row in EUR. */
export function annualEUR(sub, rates) {
  if (sub.billing_cycle === 'free') return 0;
  return toEUR(annualize(sub.cost_amount, sub.cost_period, sub.cycle_months), sub.currency, rates);
}

/** Expected single charge in EUR (what should appear on the card statement). */
export function chargeAmountEUR(sub, rates) {
  const annual = annualEUR(sub, rates);
  if (annual == null) return null;
  const months = sub.billing_cycle === 'monthly' ? 1 : sub.cycle_months || 12;
  return (annual * months) / 12;
}

export const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
