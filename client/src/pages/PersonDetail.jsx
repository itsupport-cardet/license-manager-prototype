import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Stack, Group, Title, Text, Button, Paper, Table, Badge, Anchor, Alert, Skeleton, SimpleGrid } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconUserOff, IconEdit } from '../icons.js';
import { useApi, post, put, patch, attempt } from '../api.js';
import { useLookups } from '../App.jsx';
import { fmtDate, StatusBadge } from '../format.jsx';
import { TaskList } from './SubscriptionDetail.jsx';
import { PersonModal } from './People.jsx';

export default function PersonDetail() {
  const { id } = useParams();
  const lk = useLookups();
  const { data: p, reload } = useApi(`/people/${id}`);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState(null);
  if (!p) return <Skeleton h={300} />;

  const activeSeats = p.seats.filter((s) => !s.revoked_on && ['active', 'trial'].includes(s.sub_status));

  const offboard = () => modals.openConfirmModal({
    title: `Offboard ${p.name}?`,
    children: (
      <Stack gap="xs">
        <Text size="sm">This revokes all {activeSeats.length} active seats and marks {p.name} as having left.</Text>
        {activeSeats.length > 0 && <Text size="sm" c="dimmed">{activeSeats.map((s) => s.product).join(', ')}</Text>}
        <Text size="sm">Remember to also remove their access in each tool.</Text>
      </Stack>
    ),
    labels: { confirm: 'Offboard', cancel: 'Cancel' }, confirmProps: { color: 'red' },
    onConfirm: async () => {
      const r = await attempt(() => post(`/people/${p.id}/offboard`), `${p.name} offboarded`);
      setResult(r); reload(); lk.refreshAll();
    },
  });
  const reactivate = async () => {
    await attempt(() => put(`/people/${p.id}`, { name: p.name, email: p.email, kind: p.kind, department_id: p.department_id, active: 1 }), 'Marked as current');
    reload(); lk.reload();
  };
  const revoke = async (seat) => { await attempt(() => patch(`/seats/${seat.id}`, { revoked: true }), 'Seat revoked'); reload(); };

  return (
    <Stack>
      <Anchor component={Link} to="/people" size="sm">← People</Anchor>
      <Group justify="space-between">
        <div>
          <Group gap="sm"><Title order={2}>{p.name}</Title>
            {p.kind === 'team' && <Badge variant="light" color="grape">team / mailbox</Badge>}
            {!p.active && <Badge color="gray">left</Badge>}</Group>
          <Text c="dimmed" size="sm">{[p.email, p.department_name].filter(Boolean).join(' · ') || 'No email recorded'}</Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconEdit size={16} />} onClick={() => setEditing(true)}>Edit</Button>
          {p.active ? <Button color="red" variant="light" leftSection={<IconUserOff size={16} />} onClick={offboard}>Offboard</Button>
            : <Button variant="light" onClick={reactivate}>Mark as current</Button>}
        </Group>
      </Group>

      {result && (
        <Alert color="teal" title="Offboarding done" withCloseButton onClose={() => setResult(null)}>
          <Text size="sm">Revoked: {result.revoked.join(', ') || 'no seats'}.</Text>
          {result.still_owner_of.length > 0 && (
            <Text size="sm" mt={4}><b>Still owner of:</b> {result.still_owner_of.map((s, i) => <span key={s.id}>{i > 0 && ', '}<Anchor component={Link} to={`/subscriptions/${s.id}`} size="sm">{s.product}</Anchor></span>)}. Assign a new owner.</Text>
          )}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md" radius="md">
          <Text fw={600} mb="xs">Licence seats</Text>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {p.seats.map((s) => (
                <Table.Tr key={s.id} style={{ opacity: s.revoked_on ? 0.55 : 1 }}>
                  <Table.Td><Anchor component={Link} to={`/subscriptions/${s.subscription_id}`} size="sm" fw={500}>{s.product}</Anchor>
                    <Text size="xs" c="dimmed">{s.plan}</Text></Table.Td>
                  <Table.Td>{s.revoked_on ? <Badge size="sm" color="gray" variant="light">revoked {fmtDate(s.revoked_on)}</Badge> : <StatusBadge status={s.sub_status} />}</Table.Td>
                  <Table.Td ta="right">{!s.revoked_on && <Button size="compact-xs" variant="subtle" color="red" onClick={() => revoke(s)}>Revoke</Button>}</Table.Td>
                </Table.Tr>
              ))}
              {!p.seats.length && <Table.Tr><Table.Td><Text size="sm" c="dimmed">No seats.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </Paper>
        <Stack>
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="xs">Owner of</Text>
            {p.owned.length ? (
              <Group gap="xs">{p.owned.map((s) => <Badge key={s.id} component={Link} to={`/subscriptions/${s.id}`} variant={s.status === 'active' ? 'light' : 'default'} size="lg" fw={500} style={{ cursor: 'pointer' }}>{s.product}</Badge>)}</Group>
            ) : <Text size="sm" c="dimmed">Not the owner of any subscription.</Text>}
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="xs">Tasks</Text>
            <TaskList tasks={p.tasks} onChange={reload} showProduct />
          </Paper>
        </Stack>
      </SimpleGrid>
      <PersonModal opened={editing} onClose={() => setEditing(false)} person={p} departments={lk.departments} onSaved={() => { reload(); lk.reload(); }} />
    </Stack>
  );
}
