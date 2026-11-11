import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, addMonths } from '../lib/dates.js';
import { parseCost, parseCycle, annualize, annualEUR, chargeAmountEUR } from '../lib/money.js';

test('parseDate handles every format in the inventory sheet', () => {
  assert.equal(parseDate(new Date(Date.UTC(2026, 9, 8))), '2026-10-08');
  assert.equal(parseDate('27/05/2025'), '2025-05-27');
  assert.equal(parseDate('27-02-2027'), '2027-02-27');
  assert.equal(parseDate('13.06.2025'), '2025-06-13');
  assert.equal(parseDate('2026-10-08'), '2026-10-08');
  assert.equal(parseDate('31/02/2025'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('n/a'), null);
});

test('addMonths clamps to month end', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2025-06-19', 27), '2027-09-19');
  assert.equal(addMonths('2024-12-24', 12), '2025-12-24');
});

test('parseCycle', () => {
  assert.deepEqual(parseCycle('Monthly'), { cycle: 'monthly', months: 1 });
  assert.deepEqual(parseCycle('Annual'), { cycle: 'annual', months: 12 });
  assert.deepEqual(parseCycle('Yearly'), { cycle: 'annual', months: 12 });
  assert.deepEqual(parseCycle('Two years'), { cycle: 'multi_year', months: 24 });
  assert.deepEqual(parseCycle('27 months'), { cycle: 'multi_year', months: 27 });
  assert.deepEqual(parseCycle(null), { cycle: null, months: null });
});

// Every distinct "Total Amount" value found in the sheet.
const COSTS = [
  ['$3,140.00 USD', 24, { amount: 3140, currency: 'USD', period: 'term' }],
  ['€1337.04/yr (€111.42/mo)', 1, { amount: 1337.04, currency: 'EUR', period: 'year' }],
  ['$724.00 USD', 12, { amount: 724, currency: 'USD', period: 'year' }],
  [45, 1, { amount: 45, currency: 'EUR', period: 'month' }],
  ['Free', null, { amount: 0, kind: 'free' }],
  ['$192.00 ($16/mo)', 1, { amount: 192, currency: 'USD', period: 'year' }],
  [504.1, 12, { amount: 504.1, currency: 'EUR', period: 'year' }],
  ['€72.00 ($11/mo - 50%)', 1, { amount: 72, currency: 'EUR', period: 'year' }],
  ['€360.00 (€180 x 2)', 12, { amount: 360, currency: 'EUR', period: 'year', seats: 2 }],
  ['€480.00 (€40/mo)', 12, { amount: 480, currency: 'EUR', period: 'year' }],
  ['Included / Free', null, { amount: 0, kind: 'free' }],
  ['€288.00 (€144 x 2)', 12, { amount: 288, currency: 'EUR', period: 'year', seats: 2 }],
  ['Custom', null, { amount: null, kind: 'custom' }],
  ['$468.00 ($39/mo)', 1, { amount: 468, currency: 'USD', period: 'year' }],
  ['€108.00 (€9/mo)', 12, { amount: 108, currency: 'EUR', period: 'year' }],
  ['$240.00 ($20/mo)', 1, { amount: 240, currency: 'USD', period: 'year' }],
  ['$1236.00 ($103/mo)', 1, { amount: 1236, currency: 'USD', period: 'year' }],
  ['$288.00 ($24/mo)', 1, { amount: 288, currency: 'USD', period: 'year' }],
  [6096.96, 12, { amount: 6096.96, currency: 'EUR', period: 'year' }],
  [70, 27, { amount: 70, currency: 'EUR', period: 'term' }],
  [0, null, { amount: 0, kind: 'free' }],
];

for (const [input, months, expected] of COSTS) {
  test(`parseCost(${JSON.stringify(input)})`, () => {
    const r = parseCost(input, months);
    for (const [k, v] of Object.entries(expected)) assert.equal(r[k], v, `${k} of ${input}`);
  });
}

test('annualize and EUR conversion', () => {
  assert.equal(annualize(20, 'month', 1), 240);
  assert.equal(annualize(3140, 'term', 24), 1570);
  assert.equal(annualize(70, 'term', 27).toFixed(2), '31.11');
  const rates = { USD: 0.9 };
  assert.equal(annualEUR({ cost_amount: 100, currency: 'USD', cost_period: 'year', billing_cycle: 'annual' }, rates), 90);
  assert.equal(annualEUR({ billing_cycle: 'free', cost_amount: 0 }, rates), 0);
  // monthly-billed sub priced per year -> one charge is 1/12
  assert.equal(chargeAmountEUR({ cost_amount: 240, currency: 'EUR', cost_period: 'year', billing_cycle: 'monthly' }, rates), 20);
  // 27-month term -> one charge is the whole term
  assert.equal(Math.round(chargeAmountEUR({ cost_amount: 70, currency: 'EUR', cost_period: 'term', billing_cycle: 'multi_year', cycle_months: 27 }, rates)), 70);
});
