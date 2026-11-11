import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Stack, Paper, Group, Text, RingProgress, Chip, Table, Badge, Anchor, Skeleton, SimpleGrid } from '@mantine/core';
import { useApi } from '../api.js';
import { SEVERITY, HEALTH_LABEL } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

const ORDER = { error: 0, warning: 1, info: 2 };

export default function DataHealth() {
  const { data } = useApi('/health');
  const [codes, setCodes] = useState([]);
  const [sev, setSev] = useState(['error', 'warning']);
  if (!data) return <Skeleton h={300} />;

  const issues = data.issues
    .filter((i) => sev.includes(i.severity) && (!codes.length || codes.includes(i.code)))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.product.localeCompare(b.product));
  const color = data.score >= 80 ? 'teal' : data.score >= 50 ? 'yellow' : 'red';

  return (
    <Stack>
      <PageHeader title="Data health" subtitle="What's missing or doubtful in the inventory. Fix these to trust the numbers." />
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="md" radius="md">
          <Group>
            <RingProgress size={110} thickness={10} roundCaps sections={[{ value: data.score, color }]}
              label={<Text ta="center" fw={700} fz="lg">{data.score}%</Text>} />
            <div>
              <Text fw={600}>Complete records</Text>
              <Text size="sm" c="dimmed">{data.clean} of {data.total} active subscriptions have no warnings</Text>
            </div>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ gridColumn: 'span 2' }}>
          <Text fw={600} mb="xs">Filter by issue</Text>
          <Chip.Group multiple value={codes} onChange={setCodes}>
            <Group gap={6}>
              {Object.entries(data.byCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                <Chip key={code} value={code} size="xs">{HEALTH_LABEL[code] || code} · {n}</Chip>
              ))}
            </Group>
          </Chip.Group>
          <Chip.Group multiple value={sev} onChange={setSev}>
            <Group gap={6} mt="sm">
              {Object.entries(SEVERITY).map(([k, v]) => <Chip key={k} value={k} size="xs" color={v.color}>{v.label}</Chip>)}
            </Group>
          </Chip.Group>
        </Paper>
      </SimpleGrid>
      <Paper withBorder radius="md">
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Subscription</Table.Th><Table.Th>Issue</Table.Th><Table.Th>Severity</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {issues.map((i, n) => (
              <Table.Tr key={n}>
                <Table.Td><Anchor component={Link} to={`/subscriptions/${i.subscription_id}`} size="sm" fw={500}>{i.product}</Anchor></Table.Td>
                <Table.Td><Text size="sm">{i.message}</Text></Table.Td>
                <Table.Td><Badge size="sm" variant="light" color={SEVERITY[i.severity].color}>{SEVERITY[i.severity].label}</Badge></Table.Td>
              </Table.Tr>
            ))}
            {!issues.length && <Table.Tr><Table.Td colSpan={3}><Text c="dimmed" ta="center" py="md">No issues for this filter.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
