import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Stack, SegmentedControl, Paper, Text, Group, Table, Anchor, Badge, Button, Title, Alert, Skeleton } from '@mantine/core';
import { IconAlertTriangle, IconRefresh, IconBan } from '../icons.js';
import { useApi, post, patch, attempt } from '../api.js';
import { useLookups } from '../App.jsx';
import { eur, fmtDate, RenewalBadge } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Renewals() {
  const [days, setDays] = useState('90');
  const { data, reload } = useApi('/renewals?days=365');
  const lk = useLookups();
  const refresh = () => { reload(); lk.refreshAll(); };

  const groups = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    for (const s of data.upcoming.filter((x) => x.renewal.days <= Number(days))) {
      const key = s.renewal.date.slice(0, 7);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    }
    return [...m.entries()];
  }, [data, days]);

  if (!data) return <Stack><Skeleton h={40} /><Skeleton h={300} /></Stack>;

  const renewed = async (s) => { await attempt(() => post(`/subscriptions/${s.id}/renewed`, {}), `${s.product} marked renewed`); refresh(); };
  const cancelled = async (s) => { await attempt(() => patch(`/subscriptions/${s.id}`, { status: 'cancelled' }), `${s.product} marked cancelled`); refresh(); };

  return (
    <Stack>
      <PageHeader title="Renewals" subtitle="What renews when, and what needs a decision">
        <SegmentedControl value={days} onChange={setDays}
          data={[{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }, { value: '365', label: '12 months' }]} />
      </PageHeader>

      {data.overdue.length > 0 && (
        <Paper withBorder radius="md" p="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
          <Group gap="xs" mb="xs"><IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
            <Text fw={600}>Decision needed: {data.overdue.length} renewal dates have passed</Text></Group>
          <Text size="sm" c="dimmed" mb="sm">These aren't marked as auto-renewing, so we don't know whether they renewed. Record what happened.</Text>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {data.overdue.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td><Anchor component={Link} to={`/subscriptions/${s.id}`} fw={500} size="sm">{s.product}</Anchor>
                    <Text size="xs" c="dimmed">{s.owner_name || 'No owner'} · {eur(s.charge_eur)}</Text></Table.Td>
                  <Table.Td><RenewalBadge renewal={s.renewal} /></Table.Td>
                  <Table.Td ta="right">
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={() => renewed(s)}>It renewed</Button>
                      <Button size="xs" variant="subtle" color="red" leftSection={<IconBan size={14} />} onClick={() => cancelled(s)}>It was cancelled</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {groups.length === 0 && <Alert color="gray">Nothing renews in the next {days} days.</Alert>}
      {groups.map(([month, subs]) => {
        const label = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        const total = subs.reduce((a, s) => a + (s.charge_eur || 0), 0);
        return (
          <Paper key={month} withBorder radius="md" p="md">
            <Group justify="space-between" mb="xs">
              <Title order={4}>{label}</Title>
              <Text size="sm" c="dimmed">{subs.length} renewal{subs.length > 1 ? 's' : ''} · <b>{eur(total)}</b> expected</Text>
            </Group>
            <Table verticalSpacing="xs">
              <Table.Tbody>
                {subs.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td w={120}><Text size="sm" fw={500}>{fmtDate(s.renewal.date)}</Text></Table.Td>
                    <Table.Td><Anchor component={Link} to={`/subscriptions/${s.id}`} size="sm" fw={500}>{s.product}</Anchor>
                      <Text size="xs" c="dimmed">{[s.plan, s.owner_name].filter(Boolean).join(' · ')}</Text></Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {s.billing_cycle === 'monthly' && <Badge size="sm" variant="default">monthly</Badge>}
                        {s.auto_renew === 1 ? <Badge size="sm" variant="light" color="teal">auto-renews</Badge>
                          : s.auto_renew === 0 ? <Badge size="sm" variant="light" color="orange">manual renewal</Badge>
                            : s.billing_cycle !== 'monthly' && <Badge size="sm" variant="outline" color="gray">auto-renew?</Badge>}
                        {s.payment_label && <Badge size="sm" variant="default">{s.payment_label}</Badge>}
                      </Group>
                    </Table.Td>
                    <Table.Td className="num"><Text size="sm">{eur(s.charge_eur)}</Text></Table.Td>
                    <Table.Td w={110} ta="right"><RenewalBadge renewal={s.renewal} withDate={false} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        );
      })}

      {data.unknown.length > 0 && (
        <Paper withBorder radius="md" p="md">
          <Text fw={600} mb={4}>No renewal date ({data.unknown.length})</Text>
          <Text size="sm" c="dimmed" mb="sm">Add the next renewal date so these show up in the calendar.</Text>
          <Group gap="xs">{data.unknown.map((s) => (
            <Badge key={s.id} component={Link} to={`/subscriptions/${s.id}`} variant="default" size="lg" fw={500} style={{ cursor: 'pointer' }}>{s.product}</Badge>
          ))}</Group>
        </Paper>
      )}
    </Stack>
  );
}
