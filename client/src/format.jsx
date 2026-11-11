import { Badge, Tooltip } from '@mantine/core';

const eurFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurFmt2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (n, cents = false) => (n == null ? '—' : (cents ? eurFmt2 : eurFmt).format(n));
export const eurShort = (n) => (n == null ? '—' : n >= 1000 ? `€${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : eur(n));

export function money(amount, currency = 'EUR') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const CYCLE_LABEL = { monthly: 'Monthly', annual: 'Annual', multi_year: 'Multi-year', free: 'Free', custom: 'Custom' };
export const PERIOD_LABEL = { month: 'per month', year: 'per year', term: 'per term' };

export const STATUS = {
  active: { color: 'teal', label: 'Active' },
  trial: { color: 'cyan', label: 'Trial' },
  inactive: { color: 'gray', label: 'Inactive' },
  cancelled: { color: 'red', label: 'Cancelled' },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || { color: 'gray', label: status };
  return <Badge color={s.color} variant="light" size="sm">{s.label}</Badge>;
}

export const RENEWAL = {
  overdue: { color: 'red', label: 'Overdue' },
  due_30: { color: 'orange', label: '≤ 30 days' },
  due_60: { color: 'yellow', label: '≤ 60 days' },
  due_90: { color: 'blue', label: '≤ 90 days' },
  later: { color: 'gray', label: 'Later' },
  unknown: { color: 'gray', label: 'No date' },
  none: { color: 'gray', label: '—' },
};

export function RenewalBadge({ renewal, withDate = true }) {
  if (!renewal || renewal.state === 'none') return <span style={{ color: 'var(--mantine-color-dimmed)' }}>—</span>;
  if (renewal.state === 'unknown') return <Badge color="gray" variant="outline" size="sm">No date</Badge>;
  const { color } = RENEWAL[renewal.state];
  const rel = renewal.days < 0 ? `${-renewal.days}d overdue` : renewal.days === 0 ? 'today' : `in ${renewal.days}d`;
  const badge = (
    <Badge color={color} variant={renewal.state === 'later' ? 'outline' : 'light'} size="sm">
      {withDate ? `${fmtDate(renewal.date)} · ${rel}` : rel}
    </Badge>
  );
  return renewal.rolled
    ? <Tooltip label="Auto-renewing: date rolled forward from the last known renewal">{badge}</Tooltip>
    : badge;
}

export const SEVERITY = {
  error: { color: 'red', label: 'Action needed' },
  warning: { color: 'orange', label: 'Missing / check' },
  info: { color: 'gray', label: 'Nice to have' },
};

export const HEALTH_LABEL = {
  overdue: 'Renewal date passed', no_renewal: 'No renewal date', no_owner: 'No owner', no_cost: 'No cost',
  no_payment: 'No payment method', over_assigned: 'Too many seats assigned', auto_renew_unknown: 'Auto-renew unknown',
  no_department: 'No department', no_billing_email: 'No billing email', review: 'Imported data to review',
};

export function costLine(s) {
  if (s.billing_cycle === 'free') return 'Free';
  if (s.billing_cycle === 'custom' && s.cost_amount == null) return 'Custom pricing';
  if (s.cost_amount == null) return '—';
  const period = s.cost_period === 'term' ? `per ${s.cycle_months}-month term` : PERIOD_LABEL[s.cost_period] || '';
  return `${money(s.cost_amount, s.currency)} ${period}`;
}

export const options = (rows, labelKey = 'name') => (rows || []).map((r) => ({ value: String(r.id), label: r[labelKey] }));
export const idOrNull = (v) => (v == null || v === '' ? null : Number(v));
