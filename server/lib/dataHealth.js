// Data quality checks on an enriched subscription.
// severity: 'error' (wrong / action required), 'warning' (missing important data), 'info' (nice to have)

export function healthIssues(s) {
  const out = [];
  const add = (severity, code, message) => out.push({ severity, code, message });
  const live = s.status === 'active' || s.status === 'trial';

  for (const r of s.review_reasons || []) add('warning', 'review', r);
  if (!live) return out;

  const paid = !['free'].includes(s.billing_cycle);
  if (s.renewal?.state === 'overdue') add('error', 'overdue', `Renewal date ${s.renewal.date} has passed: confirm whether it renewed or was cancelled`);
  if (paid && s.renewal?.state === 'unknown') add('warning', 'no_renewal', 'Renewal date missing');
  if (!s.owner_id) add('warning', 'no_owner', 'No owner assigned');
  if (paid && s.billing_cycle !== 'custom' && s.cost_amount == null) add('warning', 'no_cost', 'Cost missing');
  if (paid && !s.payment_method_id) add('warning', 'no_payment', 'Payment method missing');
  if (s.seats_purchased != null && s.seats_used > s.seats_purchased) {
    add('error', 'over_assigned', `${s.seats_used} seats assigned but only ${s.seats_purchased} purchased`);
  }
  if (paid && s.billing_cycle !== 'monthly' && s.auto_renew == null) add('info', 'auto_renew_unknown', 'Auto-renew not specified');
  if (!s.departments?.length) add('info', 'no_department', 'No department');
  if (paid && !s.billing_email) add('info', 'no_billing_email', 'Billing email missing');
  return out;
}
