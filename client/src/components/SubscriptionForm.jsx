import { useEffect, useState } from 'react';
import {
  Drawer, TextInput, Select, NumberInput, Textarea, MultiSelect, SegmentedControl, Button, Group, Stack, SimpleGrid,
  Divider, Text, Autocomplete, Alert,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useLookups } from '../App.jsx';
import { post, put, notifyError } from '../api.js';
import { options, idOrNull } from '../format.jsx';

const EMPTY = {
  product: '', vendor_name: '', vendor_id: null, plan: '', entity_id: null, status: 'active', account_name: '', account_email: '',
  customer_id: '', billing_email: '', billing_cycle: 'annual', cycle_months: 12, cost_amount: null, currency: 'EUR',
  cost_period: 'year', seats_purchased: null, last_invoice_no: '', last_invoice_date: null, last_renewal_date: null,
  next_renewal_date: null, auto_renew: null, payment_method_id: null, discount_pct: null, discount_note: '',
  credentials_location: '', description: '', initial_note: '', owner_id: null, department_ids: [],
};

const toForm = (s) => {
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) if (s[k] !== undefined) f[k] = s[k];
  f.vendor_name = s.vendor_name || '';
  return f;
};

function Section({ children }) {
  return <Divider my="xs" label={<Text size="xs" fw={700} tt="uppercase" c="dimmed">{children}</Text>} labelPosition="left" />;
}

export default function SubscriptionForm({ opened, onClose, subscription, onSaved }) {
  const lk = useLookups();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);

  useEffect(() => { if (opened) { setF(subscription ? toForm(subscription) : { ...EMPTY, entity_id: lk.entities[0]?.id ?? null }); setErrors(null); } }, [opened, subscription, lk.entities]);

  // Read the input value right away: React clears event.currentTarget after the handler returns,
  // so reading it inside the (deferred) state updater stored the event object itself.
  const set = (k) => (v) => {
    const value = v?.currentTarget ? v.currentTarget.value : v;
    setF((p) => ({ ...p, [k]: value }));
  };
  const setId = (k) => (v) => setF((p) => ({ ...p, [k]: idOrNull(v) }));
  const str = (v) => (v == null ? null : String(v));

  const onCycle = (cycle) => setF((p) => ({
    ...p, billing_cycle: cycle,
    cycle_months: cycle === 'monthly' ? 1 : cycle === 'annual' ? 12 : cycle === 'multi_year' ? (p.cycle_months > 12 ? p.cycle_months : 24) : null,
    cost_period: cycle === 'monthly' ? 'month' : cycle === 'multi_year' ? 'term' : cycle === 'free' ? null : p.cost_period === 'month' ? 'month' : 'year',
    cost_amount: cycle === 'free' ? 0 : p.cost_amount,
  }));

  const save = async () => {
    setBusy(true); setErrors(null);
    const vendor = lk.vendors.find((v) => v.name.toLowerCase() === f.vendor_name.trim().toLowerCase());
    const body = { ...f, vendor_id: vendor?.id ?? null, vendor_name: f.vendor_name.trim() || null };
    try {
      const saved = subscription ? await put(`/subscriptions/${subscription.id}`, body) : await post('/subscriptions', body);
      lk.reload();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setErrors(e.details || [e.message]);
      notifyError(e);
    } finally { setBusy(false); }
  };

  const persons = lk.people.map((p) => ({ value: String(p.id), label: p.kind === 'team' ? `${p.name} (team)` : p.name }));

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="xl" title={<Text fw={700}>{subscription ? `Edit ${subscription.product}` : 'New subscription'}</Text>}>
      <Stack gap="sm" pb="md">
        {errors && <Alert color="red">{errors.map((e) => <div key={e}>{e}</div>)}</Alert>}
        <Section>General</Section>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Product / app name" required value={f.product} onChange={set('product')} placeholder="e.g. Canva Pro" />
          <Autocomplete label="Vendor" description="Pick an existing vendor or type a new one" data={lk.vendors.map((v) => v.name)}
            value={f.vendor_name} onChange={set('vendor_name')} />
          <TextInput label="Plan" value={f.plan || ''} onChange={set('plan')} />
          <Select label="Status" data={[{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'inactive', label: 'Inactive' }, { value: 'cancelled', label: 'Cancelled' }]}
            value={f.status} onChange={set('status')} allowDeselect={false} />
          <Select label="Paying entity" data={options(lk.entities)} value={str(f.entity_id)} onChange={setId('entity_id')} clearable />
          <MultiSelect label="Departments" data={options(lk.departments)} value={f.department_ids.map(String)}
            onChange={(v) => setF((p) => ({ ...p, department_ids: v.map(Number) }))} searchable />
        </SimpleGrid>
        <Textarea label="Short description" value={f.description || ''} onChange={set('description')} autosize minRows={1} />

        <Section>Cost &amp; billing</Section>
        <SegmentedControl fullWidth value={f.billing_cycle || 'annual'} onChange={onCycle}
          data={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }, { value: 'multi_year', label: 'Multi-year' }, { value: 'free', label: 'Free' }, { value: 'custom', label: 'Custom' }]} />
        {f.billing_cycle !== 'free' && (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <NumberInput label="Amount" value={f.cost_amount ?? ''} onChange={(v) => set('cost_amount')(v === '' ? null : Number(v))} min={0} decimalScale={2} thousandSeparator="," />
            <Select label="Currency" data={['EUR', 'USD', 'GBP']} value={f.currency} onChange={set('currency')} allowDeselect={false} />
            <Select label="Amount is" value={f.cost_period} onChange={set('cost_period')} allowDeselect={false}
              data={[{ value: 'month', label: 'per month' }, { value: 'year', label: 'per year' }, { value: 'term', label: 'for the whole term' }]} />
            {f.billing_cycle === 'multi_year' && (
              <NumberInput label="Term length (months)" value={f.cycle_months ?? ''} onChange={(v) => set('cycle_months')(v === '' ? null : Number(v))} min={2} max={120} />
            )}
            <NumberInput label="Seats purchased" value={f.seats_purchased ?? ''} onChange={(v) => set('seats_purchased')(v === '' ? null : Number(v))} min={0} />
            <NumberInput label="Discount %" value={f.discount_pct ?? ''} onChange={(v) => set('discount_pct')(v === '' ? null : Number(v))} min={0} max={100} />
          </SimpleGrid>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Payment method" data={options(lk.payment_methods, 'label')} value={str(f.payment_method_id)} onChange={setId('payment_method_id')} clearable />
          <TextInput label="Discount / NGO pricing note" value={f.discount_note || ''} onChange={set('discount_note')} placeholder="e.g. Goodstack 50%" />
          <TextInput label="Billing email" value={f.billing_email || ''} onChange={set('billing_email')} />
          <TextInput label="Latest invoice no." value={f.last_invoice_no || ''} onChange={set('last_invoice_no')} />
        </SimpleGrid>

        <Section>Renewal</Section>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <DateInput label="Last renewal" value={f.last_renewal_date} onChange={set('last_renewal_date')} clearable valueFormat="DD MMM YYYY" />
          <DateInput label="Next renewal" value={f.next_renewal_date} onChange={set('next_renewal_date')} clearable valueFormat="DD MMM YYYY" />
          <Select label="Auto-renew" value={f.auto_renew == null ? 'unknown' : String(f.auto_renew)}
            onChange={(v) => set('auto_renew')(v === 'unknown' ? null : Number(v))} allowDeselect={false}
            data={[{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
        </SimpleGrid>

        <Section>Account &amp; ownership</Section>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Owner (accountable)" data={persons} value={str(f.owner_id)} onChange={setId('owner_id')} clearable searchable />
          <TextInput label="Account email / login" value={f.account_email || ''} onChange={set('account_email')} />
          <TextInput label="Account name" value={f.account_name || ''} onChange={set('account_name')} />
          <TextInput label="Customer / account ID" value={f.customer_id || ''} onChange={set('customer_id')} />
          <TextInput label="Where are the credentials?" description="e.g. Snipe-IT, 1Password. Never type passwords here." value={f.credentials_location || ''} onChange={set('credentials_location')} />
        </SimpleGrid>
        {/* Notes are a list managed on the subscription page; when creating you can add the first one here. */}
        {!subscription && (
          <Textarea label="First note (optional)" description="More notes can be added later from the Notes tab"
            value={f.initial_note || ''} onChange={set('initial_note')} autosize minRows={2} />
        )}
      </Stack>
      {/* Sticky footer: stays at the bottom of the drawer while the form scrolls */}
      <Group justify="flex-end" py="md" mx="calc(-1 * var(--mantine-spacing-md))" px="md"
        style={{ position: 'sticky', bottom: 0, zIndex: 2, borderTop: '1px solid var(--mantine-color-default-border)', background: 'var(--mantine-color-body)' }}>
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>{subscription ? 'Save changes' : 'Create subscription'}</Button>
      </Group>
    </Drawer>
  );
}
