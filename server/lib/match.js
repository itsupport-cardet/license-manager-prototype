// Suggest which subscription a card/bank transaction belongs to.

const norm = (s) => String(s || '').toUpperCase();
const GENERIC = new Set(['PLAN', 'THE', 'AND', 'ANNUAL', 'MONTHLY', 'SUBSCRIPTION', 'YEARLY', 'APP', 'CHATGPT', 'OPENAI', 'BUSINESS']);

/**
 * @param tx   { raw_description, note, amount_eur, card_last4 }
 * @param subs [{ id, status, vendor_keywords: string[], plan, product, card_last4, expected_charge_eur }]
 * @returns [{ subscription_id, score, reasons[] }] ranked, score 0-100, only score >= 50
 */
export function suggestMatches(tx, subs) {
  const text = norm(`${tx.raw_description} ${tx.note || ''}`);
  const results = [];
  for (const s of subs) {
    const kw = (s.vendor_keywords || []).map(norm).filter(Boolean);
    const hit = kw.find((k) => text.includes(k));
    if (!hit) continue;
    const reasons = [`Vendor keyword "${hit}"`];
    let score = 55;

    // plan hint, e.g. note "PLUS x 1" vs plan "Plus Plan"
    const planWords = norm(`${s.plan || ''} ${s.product || ''}`)
      .split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= 3 && !GENERIC.has(w));
    const planHit = planWords.find((w) => new RegExp(`\\b${w}\\b`).test(text));
    if (planHit) { score += 25; reasons.push(`Plan "${planHit}"`); }

    if (tx.card_last4 && s.card_last4) {
      if (tx.card_last4 === s.card_last4) { score += 15; reasons.push(`Card ••• ${tx.card_last4}`); }
      else score -= 10;
    }

    if (tx.amount_eur != null && s.expected_charge_eur) {
      const diff = Math.abs(tx.amount_eur - s.expected_charge_eur) / s.expected_charge_eur;
      if (diff <= 0.15) { score += 15; reasons.push('Amount matches expected charge'); }
      else if (diff <= 0.4) { score += 5; reasons.push('Amount roughly matches'); }
    }
    if (s.status && s.status !== 'active') score -= 5;
    results.push({ subscription_id: s.id, keyword: hit, planHit: Boolean(planHit), score, reasons });
  }
  // Several subscriptions from the same vendor (e.g. ChatGPT Plus / Pro / Team): if the line names
  // a plan, siblings that don't match that plan are less likely.
  for (const r of results) {
    if (!r.planHit && results.some((o) => o !== r && o.keyword === r.keyword && o.planHit)) {
      r.score -= 15; r.reasons.push('Another plan from this vendor fits better');
    }
  }
  return results
    .map(({ subscription_id, score, reasons }) => ({ subscription_id, score: Math.max(0, Math.min(100, score)), reasons }))
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score);
}

/** Pull "CARD 4*2389" card endings and "23.80 USD" amounts out of a bank statement line. */
export function parseBankLine(desc) {
  const s = String(desc || '');
  const card = s.match(/CARD\s*\d?\*+(\d{4})/i) || s.match(/(?:\*|•){2,}\s*(\d{4})/);
  const amt = s.match(/(\d+(?:[.,]\d{1,2})?)\s*(USD|EUR|GBP)\b/i);
  return {
    card_last4: card ? card[1] : null,
    orig_amount: amt ? Number(amt[1].replace(',', '.')) : null,
    orig_currency: amt ? amt[2].toUpperCase() : null,
  };
}
