import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stack, Table, Paper, Text, Badge, Button, TextInput, Modal, Group, Select, SegmentedControl, Skeleton } from '@mantine/core';
import { IconPlus, IconSearch } from '../icons.js';
import { useApi, post, put, attempt } from '../api.js';
import { useLookups } from '../App.jsx';
import { options } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function People() {
  const { data, reload } = useApi('/people');
  const lk = useLookups();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [show, setShow] = useState('active');
  const [adding, setAdding] = useState(false);

  const rows = (data || []).filter((p) => (!q || p.name.toLowerCase().includes(q.toLowerCase()))
    && (show === 'all' || (show === 'active' ? p.active : !p.active)));

  return (
    <Stack>
      <PageHeader title="People & seats" subtitle="Who holds which licence. Use a person's page to offboard them.">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>Add person</Button>
      </PageHeader>
      <Group>
        <TextInput placeholder="Search people" leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
        <SegmentedControl value={show} onChange={setShow} data={[{ value: 'active', label: 'Current' }, { value: 'left', label: 'Left' }, { value: 'all', label: 'All' }]} />
      </Group>
      <Paper withBorder radius="md">
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th ta="right">Seats held</Table.Th><Table.Th ta="right">Owns</Table.Th><Table.Th ta="right">Open tasks</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {!data && <Table.Tr><Table.Td colSpan={5}><Skeleton h={28} /></Table.Td></Table.Tr>}
            {rows.map((p) => (
              <Table.Tr key={p.id} className="clickable-row" onClick={() => nav(`/people/${p.id}`)}>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm" fw={500}>{p.name}</Text>
                    {p.kind === 'team' && <Badge size="xs" variant="light" color="grape">team / mailbox</Badge>}
                    {!p.active && <Badge size="xs" color="gray">left</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td><Text size="sm" c={p.email ? undefined : 'dimmed'}>{p.email || '—'}</Text></Table.Td>
                <Table.Td className="num">{p.active_seats}</Table.Td>
                <Table.Td className="num">{p.owned}</Table.Td>
                <Table.Td className="num">{p.open_tasks || ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <PersonModal opened={adding} onClose={() => setAdding(false)} departments={lk.departments}
        onSaved={() => { reload(); lk.reload(); }} />
    </Stack>
  );
}

export function PersonModal({ opened, onClose, person, departments, onSaved }) {
  const [f, setF] = useState(null);
  const form = f || { name: person?.name || '', email: person?.email || '', kind: person?.kind || 'person', department_id: person?.department_id ?? null, active: person?.active ?? 1 };
  const set = (k, v) => setF({ ...form, [k]: v });
  const save = async () => {
    const body = { ...form, department_id: form.department_id ? Number(form.department_id) : null };
    await attempt(() => (person ? put(`/people/${person.id}`, body) : post('/people', body)), 'Saved');
    setF(null); onSaved(); onClose();
  };
  return (
    <Modal opened={opened} onClose={() => { setF(null); onClose(); }} title={person ? 'Edit person' : 'Add person'}>
      <Stack>
        <TextInput label="Name" required value={form.name} onChange={(e) => set('name', e.currentTarget.value)} />
        <TextInput label="Email" value={form.email} onChange={(e) => set('email', e.currentTarget.value)} />
        <SegmentedControl value={form.kind} onChange={(v) => set('kind', v)} data={[{ value: 'person', label: 'Person' }, { value: 'team', label: 'Team / shared mailbox' }]} />
        <Select label="Department" data={options(departments)} value={form.department_id ? String(form.department_id) : null} onChange={(v) => set('department_id', v)} clearable />
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!form.name.trim()}>Save</Button></Group>
      </Stack>
    </Modal>
  );
}
