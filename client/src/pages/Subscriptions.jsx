import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table, TextInput, Select, Group, Button, Badge, Text, Paper, Stack, Tooltip, ScrollArea, Skeleton, ThemeIcon,
  UnstyledButton, Center,
} from '@mantine/core';
import { IconSearch, IconPlus, IconDownload, IconAlertTriangle, IconCircleCheck, IconChevronUp, IconChevronDown, IconSelector } from '../icons.js';
import { useApi } from '../api.js';
import { useLookups } from '../App.jsx';
import { eur, StatusBadge, RenewalBadge, CYCLE_LABEL, options } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SubscriptionForm from '../components/SubscriptionForm.jsx';

const SORTS = {
  product: (s) => s.product.toLowerCase(),
  annual_eur: (s) => s.annual_eur ?? -1,
  renewal: (s) => s.renewal.date || '9999',
  owner: (s) => (s.owner_name || '~').toLowerCase(),
};

function Th({ children, sortKey, sort, setSort, align }) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 1 ? IconChevronUp : IconChevronDown) : IconSelector;
  return (
    <Table.Th style={{ whiteSpace: 'nowrap' }} ta={align}>
      <UnstyledButton onClick={() => setSort({ key: sortKey, dir: active ? -sort.dir : 1 })}>
        <Group gap={4} wrap="nowrap" justify={align === 'right' ? 'flex-end' : 'flex-start'}>
          <Text fw={600} size="sm">{children}</Text><Icon size={14} />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

export function HealthIcon({ health }) {
  const serious = health.filter((h) => h.severity !== 'info');
  if (!serious.length) return <ThemeIcon variant="transparent" color="teal" size="sm"><IconCircleCheck size={16} /></ThemeIcon>;
  const color = serious.some((h) => h.severity === 'error') ? 'red' : 'orange';
  return (
    <Tooltip multiline w={280} label={serious.map((h) => <div key={h.message}>• {h.message}</div>)}>
      <ThemeIcon variant="transparent" color={color} size="sm"><IconAlertTriangle size={16} /></ThemeIcon>
    </Tooltip>
  );
}

export default function Subscriptions() {
  const lk = useLookups();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [sort, setSort] = useState({ key: 'product', dir: 1 });
  const { data, loading, reload } = useApi('/subscriptions');

  const filters = Object.fromEntries(['q', 'status', 'entity', 'dept', 'card', 'cycle'].map((k) => [k, params.get(k) || '']));
  if (!params.has('status')) filters.status = 'live';
  const setFilter = (k) => (v) => {
    const next = new URLSearchParams(params);
    const val = v?.currentTarget ? v.currentTarget.value : v;
    if (val) next.set(k, val); else next.delete(k);
    if (k === 'status' && !val) next.set('status', 'all');
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filters.q.toLowerCase();
    const list = data.filter((s) =>
      (!q || [s.product, s.vendor_name, s.plan, s.owner_name, s.description, s.notes_text].some((x) => x?.toLowerCase().includes(q)))
      && (filters.status === 'all' || (filters.status === 'live' ? ['active', 'trial'].includes(s.status) : s.status === filters.status))
      && (!filters.entity || s.entity_id === Number(filters.entity))
      && (!filters.dept || s.department_ids.includes(Number(filters.dept)))
      && (!filters.card || (filters.card === 'none' ? !s.payment_method_id : s.payment_method_id === Number(filters.card)))
      && (!filters.cycle || s.billing_cycle === filters.cycle));
    const key = SORTS[sort.key];
    return [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [data, filters.q, filters.status, filters.entity, filters.dept, filters.card, filters.cycle, sort]);

  const total = rows.reduce((a, s) => a + (s.annual_eur || 0), 0);

  return (
    <Stack>
      <PageHeader title="Subscriptions" subtitle="Every paid or free tool CARDET uses, with cost, owner and renewal">
        <Button variant="default" leftSection={<IconDownload size={16} />} component="a" href="/api/export/subscriptions.csv">Export CSV</Button>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setFormOpen(true)}>New subscription</Button>
      </PageHeader>

      <Paper withBorder p="sm" radius="md">
        <Group gap="sm" wrap="wrap">
          <TextInput placeholder="Search name, owner, notes…" leftSection={<IconSearch size={16} />} value={filters.q} onChange={setFilter('q')} w={{ base: '100%', sm: 260 }} />
          <Select w={150} value={filters.status} onChange={setFilter('status')} allowDeselect={false}
            data={[{ value: 'live', label: 'Active & trial' }, { value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'inactive', label: 'Inactive' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <Select w={160} placeholder="Entity" data={options(lk.entities)} value={filters.entity || null} onChange={setFilter('entity')} clearable />
          <Select w={190} placeholder="Department" data={options(lk.departments)} value={filters.dept || null} onChange={setFilter('dept')} clearable searchable />
          <Select w={170} placeholder="Payment method" data={[...options(lk.payment_methods, 'label'), { value: 'none', label: 'No payment method' }]} value={filters.card || null} onChange={setFilter('card')} clearable />
          <Select w={140} placeholder="Billing cycle" data={Object.entries(CYCLE_LABEL).map(([value, label]) => ({ value, label }))} value={filters.cycle || null} onChange={setFilter('cycle')} clearable />
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="sm" miw={980}>
            <Table.Thead>
              <Table.Tr>
                <Th sortKey="product" sort={sort} setSort={setSort}>Subscription</Th>
                <Th sortKey="owner" sort={sort} setSort={setSort}>Owner</Th>
                <Table.Th>Departments</Table.Th>
                <Th sortKey="annual_eur" sort={sort} setSort={setSort} align="right">Per year (EUR)</Th>
                <Table.Th>Cycle</Table.Th>
                <Th sortKey="renewal" sort={sort} setSort={setSort}>Next renewal</Th>
                <Table.Th ta="right">Seats</Table.Th>
                <Table.Th ta="center">Data</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading && !data && [1, 2, 3, 4, 5].map((i) => <Table.Tr key={i}><Table.Td colSpan={8}><Skeleton h={28} /></Table.Td></Table.Tr>)}
              {rows.map((s) => (
                <Table.Tr key={s.id} className="clickable-row" onClick={() => nav(`/subscriptions/${s.id}`)}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text fw={600} size="sm">{s.product}</Text>
                      {s.status !== 'active' && <StatusBadge status={s.status} />}
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1}>{[s.vendor_name, s.plan].filter(Boolean).join(' · ')}</Text>
                  </Table.Td>
                  <Table.Td><Text size="sm">{s.owner_name || <Text span c="dimmed" size="sm">—</Text>}</Text></Table.Td>
                  <Table.Td>
                    <Group gap={4}>{s.departments.slice(0, 2).map((d) => <Badge key={d} variant="default" size="sm" fw={500}>{d}</Badge>)}
                      {s.departments.length > 2 && <Badge variant="default" size="sm">+{s.departments.length - 2}</Badge>}</Group>
                  </Table.Td>
                  <Table.Td className="num">
                    <Text size="sm" fw={500}>{s.billing_cycle === 'free' ? 'Free' : eur(s.annual_eur)}</Text>
                    {s.currency !== 'EUR' && s.cost_amount != null && <Text size="xs" c="dimmed">billed in {s.currency}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm">{CYCLE_LABEL[s.billing_cycle] || '—'}{s.billing_cycle === 'multi_year' ? ` (${s.cycle_months}m)` : ''}</Text></Table.Td>
                  <Table.Td><RenewalBadge renewal={s.renewal} /></Table.Td>
                  <Table.Td className="num">
                    <Text size="sm" c={s.seats_purchased != null && s.seats_used > s.seats_purchased ? 'red' : undefined}>
                      {s.seats_used}{s.seats_purchased != null ? ` / ${s.seats_purchased}` : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td><Center><HealthIcon health={s.health} /></Center></Table.Td>
                </Table.Tr>
              ))}
              {data && !rows.length && <Table.Tr><Table.Td colSpan={8}><Text c="dimmed" ta="center" py="lg">No subscriptions match these filters.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
            {rows.length > 0 && (
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={3}><Text size="sm" c="dimmed">{rows.length} subscriptions</Text></Table.Td>
                  <Table.Td className="num"><Text size="sm" fw={700}>{eur(total)}</Text></Table.Td>
                  <Table.Td colSpan={4} />
                </Table.Tr>
              </Table.Tfoot>
            )}
          </Table>
        </ScrollArea>
      </Paper>

      <SubscriptionForm opened={formOpen} onClose={() => setFormOpen(false)} onSaved={(s) => { reload(); nav(`/subscriptions/${s.id}`); }} />
    </Stack>
  );
}
