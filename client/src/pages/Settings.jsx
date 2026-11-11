import { useState } from 'react';
import { Stack, Paper, Tabs, Table, TextInput, Button, Group, NumberInput, Text, ActionIcon, Select, Alert, Anchor } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconTrash, IconPlus, IconDeviceFloppy, IconRestore } from '../icons.js';
import { Link } from 'react-router-dom';
import { useApi, post, put, del, attempt } from '../api.js';
import { useLookups } from '../App.jsx';
import { options } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

const TABLES = {
  entities: { title: 'Entities', cols: [['name', 'Name'], ['notes', 'Notes']] },
  departments: { title: 'Departments', cols: [['name', 'Name']] },
  payment_methods: { title: 'Payment methods', cols: [['label', 'Label'], ['type', 'Type'], ['last4', 'Last 4 digits'], ['entity_id', 'Entity'], ['notes', 'Notes']] },
  vendors: { title: 'Vendors', cols: [['name', 'Name'], ['website', 'Website'], ['match_keywords', 'Bank statement keywords (comma separated)']] },
};

function LookupTable({ table }) {
  const lk = useLookups();
  const rows = lk[table];
  const [draft, setDraft] = useState({});
  const [edits, setEdits] = useState({});
  const { cols } = TABLES[table];

  const input = (row, key, value, onChange) => {
    if (key === 'entity_id') return <Select size="xs" data={options(lk.entities)} value={value ? String(value) : null} onChange={(v) => onChange(v ? Number(v) : null)} clearable />;
    if (key === 'type') return <Select size="xs" data={['card', 'bank_transfer', 'invoice', 'other']} value={value || 'card'} onChange={onChange} allowDeselect={false} />;
    return <TextInput size="xs" value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)} />;
  };
  const save = async (row) => {
    const body = Object.fromEntries(cols.map(([k]) => [k, (edits[row.id] || {})[k] ?? row[k] ?? null]));
    await attempt(() => put(`/lookups/${table}/${row.id}`, body), 'Saved');
    setEdits({ ...edits, [row.id]: undefined }); lk.reload();
  };
  const add = async () => {
    await attempt(() => post(`/lookups/${table}`, draft), 'Added');
    setDraft({}); lk.reload();
  };
  const remove = async (row) => { await attempt(() => del(`/lookups/${table}/${row.id}`), 'Deleted'); lk.reload(); };

  return (
    <Table verticalSpacing={6}>
      <Table.Thead><Table.Tr>{cols.map(([, label]) => <Table.Th key={label}>{label}</Table.Th>)}<Table.Th w={80} /></Table.Tr></Table.Thead>
      <Table.Tbody>
        {rows.map((row) => {
          const e = edits[row.id] || {};
          const dirty = Object.keys(e).length > 0;
          return (
            <Table.Tr key={row.id}>
              {cols.map(([k]) => <Table.Td key={k}>{input(row, k, e[k] ?? row[k], (v) => setEdits({ ...edits, [row.id]: { ...e, [k]: v } }))}</Table.Td>)}
              <Table.Td>
                <Group gap={2} wrap="nowrap">
                  <ActionIcon variant={dirty ? 'filled' : 'subtle'} disabled={!dirty} onClick={() => save(row)} aria-label="Save"><IconDeviceFloppy size={16} /></ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => remove(row)} aria-label="Delete"><IconTrash size={16} /></ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          );
        })}
        <Table.Tr>
          {cols.map(([k]) => <Table.Td key={k}>{input(null, k, draft[k], (v) => setDraft({ ...draft, [k]: v }))}</Table.Td>)}
          <Table.Td><ActionIcon onClick={add} disabled={!draft[cols[0][0]]} aria-label="Add"><IconPlus size={16} /></ActionIcon></Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}

function FxSettings() {
  const lk = useLookups();
  const [rates, setRates] = useState(lk.settings.fx_rates || {});
  const save = async () => { await attempt(() => put('/settings', { fx_rates: rates }), 'Exchange rates saved. Totals recalculated.'); lk.refreshAll(); };
  return (
    <Stack maw={420}>
      <Text size="sm" c="dimmed">Used to convert USD/GBP prices into EUR for totals and charge matching. The default USD rate (0.89) comes from your own 2025 card statements.</Text>
      {['USD', 'GBP'].map((c) => (
        <NumberInput key={c} label={`1 ${c} = … EUR`} value={rates[c] ?? ''} decimalScale={4} step={0.01} min={0}
          onChange={(v) => setRates({ ...rates, [c]: Number(v) })} />
      ))}
      <Group><Button onClick={save}>Save rates</Button></Group>
    </Stack>
  );
}

function Activity() {
  const { data } = useApi('/activity');
  return (
    <Table verticalSpacing={6} fz="sm">
      <Table.Thead><Table.Tr><Table.Th>When</Table.Th><Table.Th>Who</Table.Th><Table.Th>What</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>
        {(data || []).map((a) => (
          <Table.Tr key={a.id}>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>{new Date(a.at.replace(' ', 'T') + 'Z').toLocaleString('en-GB')}</Table.Td>
            <Table.Td>{a.actor}</Table.Td>
            <Table.Td>{a.product && <Anchor component={Link} to={`/subscriptions/${a.entity_id}`} size="sm">{a.product}: </Anchor>}{a.summary || a.action}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export default function Settings() {
  const lk = useLookups();
  const reset = () => modals.openConfirmModal({
    title: 'Reset demo data?',
    children: <Text size="sm">All changes are discarded and the data is reloaded from the imported spreadsheet.</Text>,
    labels: { confirm: 'Reset', cancel: 'Cancel' }, confirmProps: { color: 'red' },
    onConfirm: async () => { await attempt(() => post('/admin/reset'), 'Demo data reset'); lk.refreshAll(); },
  });
  return (
    <Stack>
      <PageHeader title="Settings" subtitle="Reference lists, exchange rates and the audit trail" />
      <Paper withBorder radius="md" p="md">
        <Tabs defaultValue="entities">
          <Tabs.List mb="md">
            {Object.entries(TABLES).map(([k, t]) => <Tabs.Tab key={k} value={k}>{t.title}</Tabs.Tab>)}
            <Tabs.Tab value="fx">Exchange rates</Tabs.Tab>
            <Tabs.Tab value="activity">Activity log</Tabs.Tab>
            <Tabs.Tab value="demo">Demo data</Tabs.Tab>
          </Tabs.List>
          {Object.keys(TABLES).map((k) => <Tabs.Panel key={k} value={k}><LookupTable table={k} /></Tabs.Panel>)}
          <Tabs.Panel value="fx"><FxSettings /></Tabs.Panel>
          <Tabs.Panel value="activity"><Activity /></Tabs.Panel>
          <Tabs.Panel value="demo">
            <Stack maw={560}>
              <Alert color="blue" title="About this prototype">
                Data comes from “SaaS _ Software Inventory V2.xlsx” and the “AI” card-statement sheet, cleaned by <code>scripts/import-xlsx.js</code>.
                On Render's free tier the database resets whenever the service restarts or redeploys.
              </Alert>
              <Group><Button color="red" variant="light" leftSection={<IconRestore size={16} />} onClick={reset}>Reset demo data</Button></Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
