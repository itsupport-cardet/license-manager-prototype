import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRenewal } from '../lib/renewals.js';
import { suggestMatches, parseBankLine } from '../lib/match.js';

const TODAY = '2026-11-11';
const base = { status: 'active', billing_cycle: 'annual', cycle_months: 12 };

test('future renewal is classified by days remaining', () => {
  assert.equal(nextRenewal({ ...base, next_renewal_date: '2026-11-27' }, TODAY).state, 'due_30');
  assert.equal(nextRenewal({ ...base, next_renewal_date: '2026-12-30' }, TODAY).state, 'due_60');
  assert.equal(nextRenewal({ ...base, next_renewal_date: '2027-02-04' }, TODAY).state, 'due_90');
  assert.equal(nextRenewal({ ...base, next_renewal_date: '2027-06-15' }, TODAY).state, 'later');
});

test('auto-renewing subscription rolls forward', () => {
  const r = nextRenewal({ ...base, auto_renew: 1, next_renewal_date: '2026-03-12' }, TODAY);
  assert.deepEqual([r.date, r.rolled, r.state], ['2027-03-12', true, 'later']);
});

test('monthly subscription rolls forward even without auto-renew flag', () => {
  const r = nextRenewal({ status: 'active', billing_cycle: 'monthly', next_renewal_date: '2025-09-22' }, TODAY);
  assert.equal(r.date, '2026-11-22');
});

test('non auto-renewing past date is overdue', () => {
  const r = nextRenewal({ ...base, auto_renew: 0, next_renewal_date: '2026-09-06' }, TODAY);
  assert.equal(r.state, 'overdue');
  assert.equal(r.days, -66);
});

test('next renewal is computed from last renewal when missing', () => {
  const r = nextRenewal({ ...base, last_renewal_date: '2025-03-07' }, TODAY);
  assert.deepEqual([r.date, r.state], ['2026-03-07', 'overdue']);
});

test('inactive, free and undated subscriptions', () => {
  assert.equal(nextRenewal({ ...base, status: 'cancelled', next_renewal_date: '2027-01-01' }, TODAY).state, 'none');
  assert.equal(nextRenewal({ status: 'active', billing_cycle: 'free' }, TODAY).state, 'none');
  assert.equal(nextRenewal({ ...base }, TODAY).state, 'unknown');
});

test('parseBankLine extracts card and original amount', () => {
  const r = parseBankLine('OPENAI *CHATGPT SUBSCR OPENAI.COM USA 23.80 USD AUTH 253147 PURCHASE SALE CARD 4*7876 2025-05-17');
  assert.deepEqual(r, { card_last4: '7876', orig_amount: 23.8, orig_currency: 'USD' });
  assert.equal(parseBankLine('Card Purchase - Foreign').card_last4, null);
});

// Subscriptions shaped like the seed data
const SUBS = [
  { id: 1, product: 'OpenAI / ChatGPT (Plus)', plan: 'Plus Plan', vendor_keywords: ['OPENAI', 'CHATGPT'], card_last4: null, expected_charge_eur: 17.8, status: 'active' },
  { id: 2, product: 'OpenAI / ChatGPT (Team)', plan: 'Business / TEAM (3 users)', vendor_keywords: ['OPENAI', 'CHATGPT'], card_last4: '4067', expected_charge_eur: 21.36, status: 'active' },
  { id: 3, product: 'OpenAI / ChatGPT (Pro - Eria)', plan: 'Pro Plan', vendor_keywords: ['OPENAI', 'CHATGPT'], card_last4: null, expected_charge_eur: 91.67, status: 'active' },
  { id: 4, product: 'Grammarly', plan: 'Pro Plan (2 seats)', vendor_keywords: ['GRAMMARLY'], card_last4: '2389', expected_charge_eur: 288, status: 'active' },
  { id: 5, product: 'Almanack AI', plan: 'Single License', vendor_keywords: ['ALMANACK'], card_last4: '2389', expected_charge_eur: 10.67, status: 'active' },
  { id: 6, product: 'Gamma App', plan: 'Pro Plan', vendor_keywords: ['GAMMA.APP', 'GAMMA'], card_last4: '2389', expected_charge_eur: 360, status: 'active' },
];
const line = (desc, card, eur, note) => ({ raw_description: desc, card_last4: card, amount_eur: eur, note });

test('ChatGPT PLUS charge on the Team card still goes to Plus', () => {
  const [best] = suggestMatches(line('OPENAI *CHATGPT SUBSCR OPENAI.COM USA 23.80 USD CARD 4*4067', '4067', 21.11, 'PLUS x 1 · Pambos?'), SUBS);
  assert.equal(best.subscription_id, 1);
});

test('ChatGPT TEAM charge goes to Team', () => {
  const [best] = suggestMatches(line('OPENAI *CHATGPT SUBSCR OPENAI.COM USA 150.00 USD CARD 4*4067', '4067', 135.57, 'TEAM x 5'), SUBS);
  assert.equal(best.subscription_id, 2);
});

test('single-vendor matches: Grammarly, Almanack, Gamma', () => {
  assert.equal(suggestMatches(line('GRAMMARLY CO*NZN2WUM GRAMMARLY.COM USA 143.99 EUR CARD 4*2389', '2389', 143.99), SUBS)[0].subscription_id, 4);
  assert.equal(suggestMatches(line('ALMANACK AI OAKVILLE CAN 11.99 USD CARD 4*2389', '2389', 10.6), SUBS)[0].subscription_id, 5);
  assert.equal(suggestMatches(line('GAMMA.APP GAMMA.APP USA 125.18 EUR CARD 4*2389', '2389', 125.18), SUBS)[0].subscription_id, 6);
});

test('unknown merchant gets no suggestion', () => {
  assert.deepEqual(suggestMatches(line('ΤΕΑΜ · Card Purchase - Foreign', null, 22.71, 'PLUS x 1 · Vicky?'), SUBS), []);
});
