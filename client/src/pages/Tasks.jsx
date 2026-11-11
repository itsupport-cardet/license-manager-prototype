import { useState } from 'react';
import { Stack, Paper, SegmentedControl, Select, Group } from '@mantine/core';
import { useApi } from '../api.js';
import { useLookups } from '../App.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { TaskList } from './SubscriptionDetail.jsx';

export default function Tasks() {
  const [show, setShow] = useState('1');
  const [who, setWho] = useState(null);
  const lk = useLookups();
  const { data, reload } = useApi(`/tasks?open=${show}`);
  const tasks = (data || []).filter((t) => !who || t.assignee_id === Number(who));
  return (
    <Stack>
      <PageHeader title="Tasks" subtitle="Follow-ups on subscriptions: discounts to request, renewals to question, data to fix. Add new ones from a subscription page." />
      <Group>
        <SegmentedControl value={show} onChange={setShow} data={[{ value: '1', label: 'Open' }, { value: '0', label: 'All' }]} />
        <Select placeholder="Anyone" data={lk.people.map((p) => ({ value: String(p.id), label: p.name }))} value={who} onChange={setWho} clearable searchable w={240} />
      </Group>
      <Paper withBorder p="md" radius="md">
        <TaskList tasks={tasks} onChange={() => { reload(); lk.refreshAll(); }} showProduct />
      </Paper>
    </Stack>
  );
}
