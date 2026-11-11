// One-time conversion: "SaaS _ Software Inventory V2.xlsx" -> seed/data.json
//
//   npm run import-xlsx [-- path/to/file.xlsx]
//
// The generic parsing (dates, costs, cycles) lives in server/lib and is unit tested.
// Everything that needed human judgement (who "Pambos" is, which department "Designers"
// belongs to, notes typed into the wrong column...) is in the curated maps below, so the
// cleaning is explicit and reviewable. Anything ambiguous gets a review reason, and the
// Data Health page lists those records.

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDate, addMonths, daysBetween } from '../server/lib/dates.js';
import { parseCost, parseCycle } from '../server/lib/money.js';
import { parseBankLine } from '../server/lib/match.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = process.argv[2] || path.join(root, 'SaaS _ Software Inventory V2.xlsx');
const outPath = path.join(root, 'seed', 'data.json');

// ---------------------------------------------------------------------------
// Curated reference data
// ---------------------------------------------------------------------------

const ENTITIES = [
  { name: 'CARDET LTD', notes: 'Main legal entity' },
  { name: 'Innovade', notes: 'Innovade LI Ltd' },
  { name: 'Learning Edge', notes: 'Learning Edge / SkillCamp' },
  { name: 'IoD', notes: 'Institute of Development' },
];
const ENTITY_ALIASES = { 'cardet ltd': 'CARDET LTD', 'cardet ltd & le': 'CARDET LTD', innovade: 'Innovade', 'learning edge': 'Learning Edge' };

const PAYMENT_METHODS = [
  { label: 'VISA ••• 2389', type: 'card', last4: '2389', entity: 'CARDET LTD' },
  { label: 'VISA ••• 4067', type: 'card', last4: '4067', entity: 'CARDET LTD' },
  { label: 'Card ••• 7876', type: 'card', last4: '7876', entity: 'Innovade', notes: 'Seen on the Innovade ChatGPT charge (AI sheet)' },
  { label: 'Bank transfer', type: 'bank_transfer', last4: null, entity: 'CARDET LTD' },
];

// "Primary Owner" free text -> canonical people. kind 'team' = shared mailbox / team.
const PEOPLE = [
  { name: 'Charalambos (Pambos) Vrasidas', aliases: ['pambos', 'pambos vrasidas', 'charalambos vrasidas'] },
  { name: 'Theodosis Karageorgakis', aliases: ['theodosis', 'theodosis karageorgakis'] },
  { name: 'Andreas Kokkalis', aliases: ['kokkalis', 'andreas kokkalis'] },
  { name: 'Bokis', aliases: ['bokis'] },
  { name: 'Eria', aliases: ['eria'] },
  { name: 'Marios P.', aliases: ['marios p.', 'marios'] },
  { name: 'Nikolina', aliases: ['nikolina'] },
  { name: 'Michaella', aliases: ['michaella'] },
  { name: 'Eleni Nicolaou', aliases: ['eleni', 'eleni nicolaou'] },
  { name: 'Georgia Prastitou', aliases: ['georgia', 'georgia prastitou'], email: 'georgia.prastitou@cardet.org' },
  { name: 'Souroullas', aliases: ['souroullas'] },
  { name: 'Vicky', aliases: ['vicky'] },
  { name: 'Penelope', aliases: ['penelope'] },
  { name: 'Andreas Georgiou', aliases: ['andreas georgiou'] },
  { name: 'Marinos Papaioakeim', aliases: ['marinos', 'marinos papaioakeim'] },
  { name: 'Demos', aliases: ['demos'] },
  { name: 'Chrysanthi Konstanti', aliases: ['chrysanthi konstanti'] },
  { name: 'Panayiotis Kallis', aliases: ['panayiotis kallis'] },
  { name: 'Chara', aliases: ['chara'] },
  { name: 'Renos', aliases: ['renos'] },
  { name: 'Nikos', aliases: ['nikos'] },
  { name: 'Valentina', aliases: ['valentina'] },
  { name: 'IT Support', kind: 'team', email: 'itsupport@cardet.org', aliases: ['itsupport', 'it support'] },
  { name: 'Finance', kind: 'team', email: 'finance@cardet.org', aliases: ['finance@cardet.org', 'finance'] },
  { name: 'Proposals Team', kind: 'team', email: 'proposals@cardet.org', aliases: ['proposals', 'proposals team'] },
];
const IGNORED_OWNERS = new Set(['cardet', 'cardet team', 'various users', 'all', '']);

// "Category/Department" tokens (split on "/") -> canonical departments. null = not a department.
const DEPT_MAP = {
  all: 'All Staff', education: 'Education', 'education & dl': 'Education', 'course development': 'Education',
  management: 'Management', development: 'Development', devs: 'Development', proposals: 'Proposals',
  communications: 'Communications', communication: 'Communications', design: 'Design', 'design team': 'Design',
  designers: 'Design', creative: 'Design', media: 'Design', 'instructional design': 'Instructional Design',
  ai: null, productivity: null, translations: 'Translations', training: 'Training & SkillCamp',
  trainings: 'Training & SkillCamp', skillcamp: 'Training & SkillCamp', learnworlds: 'Training & SkillCamp',
  it: 'IT', support: 'IT', security: 'IT', hr: 'People & Culture', 'people & culture': 'People & Culture',
  operations: 'Operations', 'business development': 'Business Development',
  'business development & proposals': ['Business Development', 'Proposals'],
  'project dissemination': 'Projects', 'program implementation': 'Projects', 'project management': 'Projects',
  'pms & research': ['Projects', 'Research'], events: 'Events',
};

// App name -> vendor (name, website, bank statement keywords)
const VENDORS = [
  ['1Password', '1password.com', '1PASSWORD,AGILEBITS', /^1password/i],
  ['Almanack', 'almanack.ai', 'ALMANACK', /^almanack/i],
  ['Anthropic', 'claude.ai', 'ANTHROPIC,CLAUDE.AI', /^anthropic/i],
  ['Articulate', 'articulate.com', 'ARTICULATE', /^articulate/i],
  ['BypassGPT', 'bypassgpt.ai', 'BYPASSGPT', /^bypass/i],
  ['Canva', 'canva.com', 'CANVA', /^canva/i],
  ['Microsoft', 'microsoft.com', 'MICROSOFT,MSFT', /^copilot/i],
  ['Cursor (Anysphere)', 'cursor.com', 'CURSOR,ANYSPHERE', /^cursor/i],
  ['DeepL', 'deepl.com', 'DEEPL', /^deepl/i],
  ['ElevenLabs', 'elevenlabs.io', 'ELEVENLABS', /^elevenlabs/i],
  ['Freepik', 'freepik.com', 'FREEPIK,FLATICON', /^freepik/i],
  ['Gamma', 'gamma.app', 'GAMMA.APP,GAMMA', /^gamma/i],
  ['Genially', 'genially.com', 'GENIALLY', /^genially/i],
  ['Google', 'workspace.google.com', 'GEMINI', /^google/i],
  ['Grammarly', 'grammarly.com', 'GRAMMARLY', /^grammarly/i],
  ['Kahoot!', 'kahoot.com', 'KAHOOT', /^kahoot/i],
  ['LearnWorlds', 'learnworlds.com', 'LEARNWORLDS', /^learnworlds/i],
  ['Owlbot (Lemon Squeezy)', 'owlbot.ai', 'LEMON SQUEEZY,LEMONSQUEEZY,OWLBOT', /^lemon/i],
  ['Lordicon', 'lordicon.com', 'LORDICON', /^lordicon/i],
  ['Mentimeter', 'mentimeter.com', 'MENTIMETER', /^mentimeter/i],
  ['Napkin AI', 'napkin.ai', 'NAPKIN', /^napkin/i],
  ['NordVPN', 'nordvpn.com', 'NORDVPN,NORD VPN', /^nordvpn/i],
  ['OpenAI', 'openai.com', 'OPENAI,CHATGPT', /^openai/i],
  ['PeopleHR (Access Group)', 'peoplehr.com', 'PEOPLEHR,PEOPLE HR', /^peoplehr/i],
  ['Powtoon', 'powtoon.com', 'POWTOON', /^powtoon/i],
  ['RGE Studio (Beefree)', 'beefree.io', 'BEEFREE,RGE STUDIO', /^rge studio/i],
  ['Bitly (QR Code Generator)', 'qr-code-generator.com', 'QRCG,QR CODE GEN,BITLY', /^qrcg/i],
  ['Salesforce', 'salesforce.com', 'SALESFORCE,NETU', /^salesforce/i],
  ['Surfshark', 'surfshark.com', 'SURFSHARK', /^surfshark/i],
  ['SurveyMonkey', 'surveymonkey.com', 'SURVEYMONKEY,MOMENTIVE', /^surveymonkey/i],
  ['Teamwork.com', 'teamwork.com', 'TEAMWORK.COM,TEAMWORK', /^teamwork/i],
  ['Undetectable AI', 'undetectable.ai', 'UNDETECTABLE', /^undetectable/i],
  ['VEED', 'veed.io', 'VEED', /^veed/i],
  ['Zoom', 'zoom.us', 'ZOOM.US,ZOOM', /^zoom/i],
];

// Per-row fixes. Keys are the exact "App/SaaS Name" values.
//   ngoIsNote: the "NGO discount" column actually holds a note
//   ngoIsTasks: the column holds action items (handled in TASKS)
const OVERRIDES = {
  '1Password': {},
  'Almanack AI': {
    set: { cost_amount: 11.99, currency: 'USD', cost_period: 'month', billing_cycle: 'monthly', cycle_months: 1, payment_method: 'VISA ••• 2389' },
    review: ['Sheet says cost 0, but the card statement (Apr 2025) shows a 11.99 USD charge'],
  },
  'Articulate 360 AI Personal': { review: ['Plan and owner missing'] },
  'ByPass GPT': { set: { cancelled_on: '2025-06-13' } },
  'Canva Pro': { set: { seats_purchased: 10 } },
  'Copilot 365': { ngoIsNote: true, review: ['Cost missing'] },
  Deepl: { set: { account_email: null } },
  ElevenLabs: { review: ['Cost "€72.00 ($11/mo - 50%)" is inconsistent: check the real yearly amount'] },
  'Gamma App (Georgia & Pambos)': { set: { product: 'Gamma App' } },
  Genially: { set: { customer_id: null } },
  Kahoot: { set: { cancelled_on: '2025-07-25' } },
  'LearnWorlds (CARDET & LE)': { set: { product: 'LearnWorlds' }, extraNote: 'Shared between CARDET LTD and Learning Edge.', review: ['Cost marked as "Custom"'] },
  Lordicon: {},
  Mentimeter: { set: { customer_id: null }, review: ['Account is in a personal name (Charalambos Vrasidas)', 'Currency unclear: source notes $83.88 / $132.00'] },
  'OpenAI / ChatGPT (Plus)': { set: { seats_purchased: 2 }, review: ['Two individual subscriptions, but the cost looks like one ($20/mo)'] },
  'OpenAI / ChatGPT (Pro - Eria)': { set: { discount_note: 'Annual Pro access via Goodstack' } },
  'OpenAI / ChatGPT (Team)': { ngoIsNote: true, set: { seats_purchased: 3 } },
  PowToon: { set: { cancelled_on: '2025-06-16' } },
  'RGE Studio (formerly Beefree': { set: { product: 'RGE Studio (formerly Beefree)' }, review: ['Only the name is filled in'] },
  'QRCG bitly': { ngoIsTasks: true, extraNote: 'Alternative noted in sheet: ~270 per year (current 450).' },
  'SalesForce (CRM & Cloud)': { set: { product: 'Salesforce (CRM & Cloud)', seats_purchased: 15, account_email: null, credentials_location: null, discount_note: 'Donation (Power of 10)' } },
  'SalesForce (Support)': { set: { product: 'Salesforce (Support via NetU)', account_email: null, credentials_location: null } },
  'TeamWork (Grow)': { set: { product: 'Teamwork (Grow)' } },
  'Zoom (Events & Webinars)': { set: { discount_pct: 50, discount_note: 'Approved: 50% via Goodstack (April 2026)' } },
};

const TASKS = [
  { sub: 'QRCG bitly', text: 'Add a yearly reminder to clear the QR codes before renewal', assignee: 'Marinos Papaioakeim', due: '2026-12-01' },
  { sub: 'QRCG bitly', text: 'Ask Marios whether we prefer payment via bank transfer', assignee: 'Marios P.' },
  { sub: 'QRCG bitly', text: 'Check a cheaper alternative (now 450/yr vs ~180-270/yr)', assignee: 'Andreas Kokkalis', due: '2026-12-15' },
  { sub: 'Zoom (Skillcamp / LE)', text: 'Check whether the renewal is still needed', assignee: 'Renos', due: '2026-05-01' },
  { sub: 'SurveyMonkey', text: 'Evaluate if still needed given Google Forms usage', assignee: 'Demos', due: '2025-12-15' },
  { sub: 'OpenAI / ChatGPT (Team)', text: 'Move from standard $30 to Goodstack $20 per-seat rate', assignee: 'Andreas Kokkalis' },
  { sub: 'Mentimeter', text: 'Apply for the educational / NGO discount (we are eligible)', assignee: 'Charalambos (Pambos) Vrasidas' },
  { sub: 'Mentimeter', text: 'Move account from personal name to CARDET', assignee: 'IT Support' },
  { sub: 'TeamWork (Grow)', text: 'Confirm the 2026 renewal date and amount', assignee: 'Andreas Georgiou' },
  { sub: '1Password', text: 'Fill in renewal date, invoice and card used', assignee: 'IT Support' },
];

const SETTINGS = {
  // Derived from the AI sheet card statements (USD charge -> EUR booked), mid-2025: ~0.89
  fx_rates: JSON.stringify({ USD: 0.89, GBP: 1.17 }),
  renewal_alert_days: '30',
  org_name: 'CARDET',
};

// ---------------------------------------------------------------------------

const COL = {
  name: 1, plan: 2, customer: 3, accountName: 4, accountEmail: 5, invoiceNo: 6, invoiceDate: 7, renewal: 8,
  duration: 9, nextRenewal: 10, autoRenew: 11, amount: 12, billingEmail: 13, paymentMethod: 14, card: 15,
  description: 16, status: 17, category: 18, owner: 19, credentials: 20, ngo: 21, notes: 22, extra: 23,
};

function cellValue(cell) {
  let v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date || typeof v === 'number') return v;
  if (typeof v === 'object') {
    if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text != null) v = v.text;
    else if (v.result != null) v = v.result;
    else return null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}
const text = (v) => (v == null ? null : v instanceof Date ? parseDate(v) : String(v).trim() || null);
const isNA = (v) => v == null || /^(n\/a|na|-)$/i.test(String(v).trim());

const aliasIndex = new Map();
for (const p of PEOPLE) for (const a of p.aliases) aliasIndex.set(a, p.name);

function resolvePeople(raw) {
  if (!raw) return { people: [], unknown: [] };
  const parts = String(raw).split(/,|&|\/|\band\b/i).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const people = []; const unknown = [];
  for (const p of parts) {
    if (IGNORED_OWNERS.has(p)) continue;
    const name = aliasIndex.get(p);
    if (name) { if (!people.includes(name)) people.push(name); } else unknown.push(p);
  }
  return { people, unknown };
}

function resolveDepartments(raw) {
  if (!raw) return [];
  const out = [];
  for (const tok of String(raw).split('/').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const mapped = tok in DEPT_MAP ? DEPT_MAP[tok] : tok.replace(/\b\w/g, (c) => c.toUpperCase());
    for (const d of [mapped].flat()) if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

function seatsFromText(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = String(t).match(/(\d+)\s*(seats?|licen[cs]es?|users)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function mapStatus(s) {
  if (!s) return null;
  if (/cancel/i.test(s)) return 'cancelled';
  if (/inactive|not renewed/i.test(s)) return 'inactive';
  if (/trial/i.test(s)) return 'trial';
  if (/active/i.test(s)) return 'active';
  return null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const inv = wb.worksheets[0];
  const aiSheet = wb.worksheets[1];

  const subscriptions = [];
  const usedPeople = new Set();
  const departments = new Set();
  const unknownOwners = new Set();

  inv.eachRow((row, r) => {
    if (r === 1) return;
    const get = (c) => cellValue(row.getCell(c));
    const name = text(get(COL.name));
    if (!name) return;
    const ov = OVERRIDES[name] || {};
    const review = [...(ov.review || [])];

    const { cycle, months } = parseCycle(get(COL.duration));
    const cost = parseCost(get(COL.amount), months);
    // "currency assumed EUR" is expected for a Cyprus org, so it is not worth a review flag.
    if (!ov.set?.cost_amount) review.push(...cost.assumptions.filter((a) => !/assumed EUR/.test(a)));

    let billing_cycle = cycle;
    if (cost.kind === 'free') billing_cycle = 'free';
    if (cost.kind === 'custom') billing_cycle = 'custom';
    if (!billing_cycle && cost.kind === 'paid') { billing_cycle = 'annual'; review.push('Billing cycle missing, assumed annual'); }

    let last = parseDate(get(COL.renewal));
    const next = parseDate(get(COL.nextRenewal));
    if (last && next && last === next) last = null; // sheet repeats the next date in both columns
    if (last && next && months && billing_cycle !== 'monthly' && Math.abs(daysBetween(addMonths(last, months), next)) > 3) {
      review.push(`Next renewal (${next}) does not equal last renewal (${last}) + ${months} months`);
    }
    // Missing dates/owner/payment are checked live by the Data Health page (server/lib/dataHealth.js).
    if (!next && last && billing_cycle !== 'monthly' && !/cancel|inactive/i.test(text(get(COL.status)) || '')) review.push('Next renewal date missing (calculated from last renewal)');

    const statusRaw = text(get(COL.status));
    let status = mapStatus(statusRaw);
    if (!status) { status = 'active'; review.push('Status not set, assumed active'); }

    const entityRaw = text(get(COL.accountName));
    let entity = ENTITY_ALIASES[entityRaw?.toLowerCase()] || null;
    let account_name = entityRaw;
    if (!entity && entityRaw) entity = 'CARDET LTD'; // personal-name accounts paid by CARDET
    if (!entity) { entity = 'CARDET LTD'; review.push('Paying entity missing, assumed CARDET LTD'); }

    const ownerRes = resolvePeople(text(get(COL.owner)));
    ownerRes.unknown.forEach((u) => unknownOwners.add(u));
    const seatPeople = ownerRes.people.filter((n) => PEOPLE.find((p) => p.name === n)?.kind !== 'team');
    const owner = seatPeople[0] || ownerRes.people[0] || null;
    ownerRes.people.forEach((p) => usedPeople.add(p));

    const depts = resolveDepartments(text(get(COL.category)));
    depts.forEach((d) => departments.add(d));

    const cardText = text(get(COL.card));
    const pm = cardText ? PAYMENT_METHODS.find((p) => p.last4 && cardText.includes(p.last4))?.label : null;

    const ngo = get(COL.ngo);
    let discount_pct = null; let discount_note = null;
    const noteParts = [text(get(COL.notes))];
    if (ov.ngoIsNote) noteParts.push(text(ngo));
    else if (ov.ngoIsTasks) { /* converted to tasks */ }
    else if (typeof ngo === 'number') discount_pct = Math.round(ngo * 100);
    else if (!isNA(ngo)) discount_note = /^yes$/i.test(text(ngo)) ? 'NGO discount applied' : text(ngo);
    if (ov.extraNote) noteParts.push(ov.extraNote);

    const plan = text(get(COL.plan));
    const notes = noteParts.filter(Boolean).join('\n') || null;
    const seats_purchased = cost.seats ?? seatsFromText(plan, notes, text(ngo));

    const emailOrNull = (v) => (v && String(v).includes('@') ? String(v).trim() : null);
    const credentials = text(get(COL.credentials));
    const autoRaw = text(get(COL.autoRenew));

    const sub = {
      key: name,
      vendor: (VENDORS.find((v) => v[3].test(name)) || [name])[0],
      product: name,
      plan,
      entity,
      status,
      account_name,
      account_email: emailOrNull(get(COL.accountEmail)),
      customer_id: isNA(get(COL.customer)) ? null : text(get(COL.customer)),
      billing_email: emailOrNull(get(COL.billingEmail)),
      billing_cycle,
      cycle_months: billing_cycle === 'multi_year' ? months : billing_cycle === 'annual' ? 12 : billing_cycle === 'monthly' ? 1 : null,
      cost_amount: cost.kind === 'custom' ? null : cost.amount,
      currency: cost.currency || 'EUR',
      cost_period: cost.period,
      seats_purchased,
      last_invoice_no: text(get(COL.invoiceNo)),
      last_invoice_date: parseDate(get(COL.invoiceDate)),
      last_renewal_date: last,
      next_renewal_date: next,
      auto_renew: autoRaw ? (/^y/i.test(autoRaw) ? 1 : /^n/i.test(autoRaw) ? 0 : null) : null,
      payment_method: pm || null,
      discount_pct,
      discount_note,
      credentials_location: credentials ? credentials.replace(/^snipe-?it$/i, 'Snipe-IT') : null,
      description: text(get(COL.description)),
      notes,
      owner,
      departments: depts,
      seats: seatPeople.map((p) => ({ person: p })),
      cancelled_on: null,
    };
    Object.assign(sub, ov.set || {});
    sub.review_reasons = [...new Set(review)];
    subscriptions.push(sub);
  });

  // --- transactions from the "AI" sheet ---------------------------------------------
  const transactions = [];
  const groupEntity = { iod: 'IoD', innovade: 'Innovade', cardet: 'CARDET LTD' };
  let currentEntity = null;
  aiSheet.eachRow((row) => {
    const a = cellValue(row.getCell(1));
    if (typeof a === 'string') {
      currentEntity = groupEntity[a.trim().toLowerCase()] ?? currentEntity;
      return; // group header ("IoD", "Cardet", "Claude Subscriptions")
    }
    if (!(a instanceof Date)) return;
    const desc = [text(cellValue(row.getCell(2))), text(cellValue(row.getCell(6)))].filter(Boolean).join(' · ');
    const amount = cellValue(row.getCell(8));
    const note = [text(cellValue(row.getCell(9))), text(cellValue(row.getCell(10)))].filter(Boolean).join(' · ') || null;
    const parsed = parseBankLine(desc);
    transactions.push({
      date: parseDate(a),
      raw_description: desc,
      amount_eur: typeof amount === 'number' ? amount : null,
      ...parsed,
      entity: currentEntity,
      note,
      source: 'AI sheet (card statements)',
    });
  });

  const seenPeople = PEOPLE.filter((p) => usedPeople.has(p.name) || TASKS.some((t) => t.assignee === p.name) || p.kind === 'team');
  const data = {
    generated_at: new Date().toISOString(),
    source: path.basename(xlsxPath),
    entities: ENTITIES,
    departments: [...departments].sort(),
    people: seenPeople.map(({ aliases, ...p }) => ({ kind: 'person', ...p })),
    payment_methods: PAYMENT_METHODS,
    vendors: VENDORS.map(([name, website, kw]) => ({ name, website, match_keywords: kw })),
    subscriptions,
    tasks: TASKS,
    transactions,
    settings: SETTINGS,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`Wrote ${path.relative(root, outPath)}`);
  console.log(`  subscriptions: ${subscriptions.length} (${subscriptions.filter((s) => s.review_reasons.length).length} need review)`);
  console.log(`  people: ${data.people.length}, departments: ${data.departments.length}, vendors: ${data.vendors.length}`);
  console.log(`  transactions: ${transactions.length}, tasks: ${TASKS.length}`);
  if (unknownOwners.size) console.log('  UNMAPPED owner tokens:', [...unknownOwners].join(', '));
  const noVendor = subscriptions.filter((s) => s.vendor === s.key && !VENDORS.some((v) => v[0] === s.vendor));
  if (noVendor.length) console.log('  NO VENDOR MAPPING:', noVendor.map((s) => s.key).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
