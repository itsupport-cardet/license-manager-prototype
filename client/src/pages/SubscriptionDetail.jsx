import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Stack, Group, Title, Text, Button, Tabs, Paper, SimpleGrid, Badge, Alert, Table, Select, Progress, Checkbox,
  TextInput, ActionIcon, Timeline, Skeleton, Anchor, Menu, Modal, NumberInput, Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { modals } from '@mantine/modals';
import {
  IconEdit, IconRefresh, IconTrash, IconDots, IconAlertTriangle, IconInfoCircle, IconUserPlus, IconUserMinus,
  IconArrowBackUp, IconPlus, IconBan, IconCheck, IconExternalLink,
} from '../icons.js';
import { useApi, post, patch, del, attempt } from '../api.js';
import { useLookups } from '../App.jsx';
import { eur, money, fmtDate, StatusBadge, RenewalBadge, CYCLE_LABEL, costLine, SEVERITY } from '../format.jsx';
import SubscriptionForm from '../components/SubscriptionForm.jsx';
import NotesTable from '../components/NotesTable.jsx';

function Field({ label, children }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">{label}</Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children ?? '—'}</Text>
    </div>
  );
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const lk = useLookups();
  const { data: s, reload, error } = useApi(`/subscriptions/${id}`);
  const [editing, setEditing] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [tab, setTab] = useState('overview');

  if (error) return <Alert color="red">{error.message}</Alert>;
  if (!s) return <Stack><Skeleton h={50} /><Skeleton h={300} /></Stack>;

  const refresh = () => { reload(); lk.refreshAll(); };
  const issues = s.health.filter((h) => h.severity !== 'info');
  const tips = s.health.filter((h) => h.severity === 'info');

  const confirmDelete = () => modals.openConfirmModal({
    title: `Delete ${s.product}?`,
    children: <Text size="sm">This removes the subscription, its seats and tasks. Linked charges become unmatched. Prefer “Mark cancelled” to keep history.</Text>,
    labels: { confirm: 'Delete', cancel: 'Keep' }, confirmProps: { color: 'red' },
    onConfirm: async () => { await attempt(() => del(`/subscriptions/${s.id}`), 'Subscription deleted'); lk.refreshAll(); nav('/subscriptions'); },
  });
  const setStatus = async (status) => { await attempt(() => patch(`/subscriptions/${s.id}`, { status }), `Marked ${status}`); refresh(); };
  const clearReview = async () => { await attempt(() => patch(`/subscriptions/${s.id}`, { review_reasons: [] }), 'Marked as reviewed'); refresh(); };

  return (
    <Stack>
      <Anchor component={Link} to="/subscriptions" size="sm">← Subscriptions</Anchor>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap="sm">
            <Title order={2}>{s.product}</Title>
            <StatusBadge status={s.status} />
          </Group>
          <Text c="dimmed" size="sm">
            {[s.vendor_name, s.plan, s.entity_name].filter(Boolean).join(' · ')}
            {s.vendor_website && <> · <Anchor href={`https://${s.vendor_website}`} target="_blank" size="sm">{s.vendor_website} <IconExternalLink size={12} /></Anchor></>}
          </Text>
        </div>
        <Group gap="xs">
          {s.status === 'active' && s.billing_cycle !== 'free' && (
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => setRenewOpen(true)}>Mark renewed</Button>
          )}
          <Button leftSection={<IconEdit size={16} />} onClick={() => setEditing(true)}>Edit</Button>
          <Menu position="bottom-end">
            <Menu.Target><ActionIcon variant="default" size="lg" aria-label="More actions"><IconDots size={18} /></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              {s.status !== 'cancelled' && <Menu.Item leftSection={<IconBan size={16} />} onClick={() => setStatus('cancelled')}>Mark cancelled</Menu.Item>}
              {s.status !== 'active' && <Menu.Item leftSection={<IconCheck size={16} />} onClick={() => setStatus('active')}>Mark active</Menu.Item>}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>Delete</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={600}>PER YEAR</Text><Text fw={700} fz="xl" className="kpi-value">{s.billing_cycle === 'free' ? 'Free' : eur(s.annual_eur)}</Text><Text size="xs" c="dimmed">{costLine(s)}</Text></Paper>
        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={600}>NEXT RENEWAL</Text><Text fw={700} fz="xl">{fmtDate(s.renewal.date)}</Text><RenewalBadge renewal={s.renewal} withDate={false} /></Paper>
        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={600}>SEATS</Text><Text fw={700} fz="xl" className="kpi-value">{s.seats_used}{s.seats_purchased != null ? ` / ${s.seats_purchased}` : ''}</Text><Text size="xs" c="dimmed">{s.seats_purchased == null ? 'purchased seats unknown' : 'assigned / purchased'}</Text></Paper>
        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={600}>OWNER</Text><Text fw={700} fz="xl" lineClamp={1}>{s.owner_name || '—'}</Text><Text size="xs" c="dimmed">{s.payment_label || 'no payment method'}</Text></Paper>
      </SimpleGrid>

      {issues.length > 0 && (
        <Alert color={issues.some((i) => i.severity === 'error') ? 'red' : 'orange'} icon={<IconAlertTriangle size={18} />} title="Needs attention">
          <Stack gap={2}>{issues.map((h) => <Text size="sm" key={h.message}>• {h.message}</Text>)}</Stack>
          {s.review_reasons.length > 0 && <Button size="xs" mt="sm" variant="white" color="dark" onClick={clearReview}>I've checked the imported data: clear review flags</Button>}
        </Alert>
      )}

      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="notes">Notes <Badge size="xs" variant="light" ml={4}>{s.notes.length}</Badge></Tabs.Tab>
          <Tabs.Tab value="seats">Seats <Badge size="xs" variant="light" ml={4}>{s.seats_used}</Badge></Tabs.Tab>
          <Tabs.Tab value="charges">Charges <Badge size="xs" variant="light" ml={4}>{s.transactions.length}</Badge></Tabs.Tab>
          <Tabs.Tab value="tasks">Tasks <Badge size="xs" variant="light" ml={4}>{s.tasks.filter((t) => !t.done).length}</Badge></Tabs.Tab>
          <Tabs.Tab value="activity">Activity</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Paper withBorder p="md" radius="md">
            <Stack>
              {s.description && <Text>{s.description}</Text>}
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                <Field label="Billing cycle">{CYCLE_LABEL[s.billing_cycle]}{s.billing_cycle === 'multi_year' ? ` · ${s.cycle_months} months` : ''}</Field>
                <Field label="Cost">{costLine(s)}</Field>
                <Field label="Expected charge (EUR)">{s.charge_eur != null ? eur(s.charge_eur, true) : '—'}</Field>
                <Field label="Auto-renew">{s.auto_renew == null ? 'Unknown' : s.auto_renew ? 'Yes' : 'No'}</Field>
                <Field label="Last renewal">{fmtDate(s.last_renewal_date)}</Field>
                <Field label="Next renewal (stored)">{fmtDate(s.next_renewal_date)}</Field>
                <Field label="Payment method">{s.payment_label}</Field>
                <Field label="Billing email">{s.billing_email}</Field>
                <Field label="Latest invoice">{s.last_invoice_no ? `${s.last_invoice_no}${s.last_invoice_date ? ` · ${fmtDate(s.last_invoice_date)}` : ''}` : null}</Field>
                <Field label="Discount">{[s.discount_pct != null ? `${s.discount_pct}%` : null, s.discount_note].filter(Boolean).join(' · ') || null}</Field>
                <Field label="Paying entity">{s.entity_name}</Field>
                <Field label="Departments">{s.departments.join(', ') || null}</Field>
                <Field label="Account name">{s.account_name}</Field>
                <Field label="Account email / login">{s.account_email}</Field>
                <Field label="Customer ID">{s.customer_id}</Field>
                <Field label="Credentials stored in">{s.credentials_location}</Field>
                {s.cancelled_on && <Field label="Cancelled on">{fmtDate(s.cancelled_on)}</Field>}
              </SimpleGrid>
              {s.notes.length > 0 && (
                <Field label={`Latest note · ${s.notes[0].author || ''}`}>
                  {s.notes[0].text}{' '}
                  <Anchor component="button" size="sm" onClick={() => setTab('notes')}>
                    {s.notes.length > 1 ? `All ${s.notes.length} notes →` : 'Open notes →'}
                  </Anchor>
                </Field>
              )}
              {tips.length > 0 && (
                <Text size="xs" c="dimmed"><IconInfoCircle size={12} /> Could be completed: {tips.map((t) => t.message.toLowerCase()).join(', ')}.</Text>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="notes" pt="md"><NotesTable subscriptionId={s.id} notes={s.notes} onChange={refresh} /></Tabs.Panel>
        <Tabs.Panel value="seats" pt="md"><SeatsTab s={s} onChange={refresh} /></Tabs.Panel>
        <Tabs.Panel value="charges" pt="md"><ChargesTab s={s} /></Tabs.Panel>
        <Tabs.Panel value="tasks" pt="md"><TasksTab s={s} onChange={refresh} /></Tabs.Panel>
        <Tabs.Panel value="activity" pt="md">
          <Paper withBorder p="md" radius="md">
            {s.activity.length === 0 ? <Text c="dimmed" size="sm">No changes recorded since the data was imported.</Text> : (
              <Timeline bulletSize={14} lineWidth={2}>
                {s.activity.map((a) => (
                  <Timeline.Item key={a.id} title={<Text size="sm" fw={500}>{a.summary || a.action}</Text>}>
                    <Text size="xs" c="dimmed">{a.actor} · {new Date(a.at.replace(' ', 'T') + 'Z').toLocaleString('en-GB')}</Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <SubscriptionForm opened={editing} onClose={() => setEditing(false)} subscription={s} onSaved={refresh} />
      <RenewModal opened={renewOpen} onClose={() => setRenewOpen(false)} s={s} onDone={refresh} />
    </Stack>
  );
}

function RenewModal({ opened, onClose, s, onDone }) {
  const [next, setNext] = useState(null);
  const [amount, setAmount] = useState('');
  const [invoice, setInvoice] = useState('');
  const submit = async () => {
    await attempt(() => post(`/subscriptions/${s.id}/renewed`, {
      next_renewal_date: next, cost_amount: amount === '' ? null : Number(amount), invoice_no: invoice || null,
    }), 'Renewal recorded');
    onClose(); onDone();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={`Record renewal: ${s.product}`}>
      <Stack>
        <Text size="sm" c="dimmed">Renewal on {fmtDate(s.renewal.date || s.next_renewal_date)}. Leave the next date empty to move it one {s.billing_cycle === 'monthly' ? 'month' : 'cycle'} forward.</Text>
        <DateInput label="Next renewal date" value={next} onChange={setNext} clearable valueFormat="DD MMM YYYY" placeholder="Automatic" />
        <NumberInput label={`New amount (${s.currency}, ${s.cost_period || 'per cycle'})`} placeholder={s.cost_amount != null ? String(s.cost_amount) : ''} value={amount} onChange={setAmount} min={0} decimalScale={2} />
        <TextInput label="Invoice number" value={invoice} onChange={(e) => setInvoice(e.currentTarget.value)} />
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancel</Button><Button onClick={submit}>Save renewal</Button></Group>
      </Stack>
    </Modal>
  );
}

function SeatsTab({ s, onChange }) {
  const lk = useLookups();
  const [person, setPerson] = useState(null);
  const active = s.seats.filter((x) => !x.revoked_on);
  const taken = new Set(active.map((x) => x.person_id));
  const candidates = lk.people.filter((p) => p.kind === 'person' && p.active && !taken.has(p.id)).map((p) => ({ value: String(p.id), label: p.name }));
  const pct = s.seats_purchased ? Math.min(100, (active.length / s.seats_purchased) * 100) : 0;

  const assign = async () => {
    if (!person) return;
    await attempt(() => post(`/subscriptions/${s.id}/seats`, { person_id: Number(person) }), 'Seat assigned');
    setPerson(null); onChange();
  };
  const toggle = async (seat, revoked) => { await attempt(() => patch(`/seats/${seat.id}`, { revoked }), revoked ? 'Seat revoked' : 'Seat restored'); onChange(); };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack>
        {s.seats_purchased != null && (
          <div>
            <Group justify="space-between"><Text size="sm" fw={500}>{active.length} of {s.seats_purchased} seats assigned</Text>
              <Text size="sm" c="dimmed">{Math.max(0, s.seats_purchased - active.length)} free</Text></Group>
            <Progress value={pct} color={active.length > s.seats_purchased ? 'red' : 'indigo'} mt={6} />
          </div>
        )}
        <Group align="flex-end">
          <Select label="Assign a seat" placeholder="Choose a person" data={candidates} value={person} onChange={setPerson} searchable w={280} />
          <Button leftSection={<IconUserPlus size={16} />} onClick={assign} disabled={!person}>Assign</Button>
        </Group>
        <Table verticalSpacing="xs">
          <Table.Thead><Table.Tr><Table.Th>Person</Table.Th><Table.Th>Assigned</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {s.seats.map((seat) => (
              <Table.Tr key={seat.id} style={{ opacity: seat.revoked_on ? 0.55 : 1 }}>
                <Table.Td><Anchor component={Link} to={`/people/${seat.person_id}`} size="sm">{seat.person_name}</Anchor>
                  {!seat.person_active && <Badge size="xs" color="gray" ml={6}>left</Badge>}</Table.Td>
                <Table.Td><Text size="sm">{seat.assigned_on ? fmtDate(seat.assigned_on) : 'from spreadsheet'}</Text></Table.Td>
                <Table.Td>{seat.revoked_on ? <Badge color="gray" variant="light" size="sm">Revoked {fmtDate(seat.revoked_on)}</Badge> : <Badge color="teal" variant="light" size="sm">Active</Badge>}</Table.Td>
                <Table.Td ta="right">
                  {seat.revoked_on
                    ? <Tooltip label="Restore seat"><ActionIcon variant="subtle" onClick={() => toggle(seat, false)} aria-label="Restore"><IconArrowBackUp size={16} /></ActionIcon></Tooltip>
                    : <Tooltip label="Revoke seat"><ActionIcon variant="subtle" color="red" onClick={() => toggle(seat, true)} aria-label="Revoke"><IconUserMinus size={16} /></ActionIcon></Tooltip>}
                </Table.Td>
              </Table.Tr>
            ))}
            {!s.seats.length && <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">No named seat holders yet.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}

function ChargesTab({ s }) {
  const total = s.transactions.filter((t) => t.match_status === 'confirmed').reduce((a, t) => a + (t.amount_eur || 0), 0);
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">Card / bank charges linked to this subscription. Confirmed total: <b>{eur(total, true)}</b></Text>
        <Anchor component={Link} to="/transactions" size="sm">Reconcile charges →</Anchor>
      </Group>
      <Table verticalSpacing="xs">
        <Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Description</Table.Th><Table.Th ta="right">EUR</Table.Th><Table.Th>Match</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {s.transactions.map((t) => (
            <Table.Tr key={t.id}>
              <Table.Td><Text size="sm">{fmtDate(t.date)}</Text></Table.Td>
              <Table.Td><Text className="mono" lineClamp={1}>{t.raw_description}</Text>{t.note && <Text size="xs" c="dimmed">{t.note}</Text>}</Table.Td>
              <Table.Td className="num"><Text size="sm">{eur(t.amount_eur, true)}</Text>{t.orig_currency && t.orig_currency !== 'EUR' && <Text size="xs" c="dimmed">{money(t.orig_amount, t.orig_currency)}</Text>}</Table.Td>
              <Table.Td><Badge size="sm" variant="light" color={t.match_status === 'confirmed' ? 'teal' : 'yellow'}>{t.match_status}</Badge></Table.Td>
            </Table.Tr>
          ))}
          {!s.transactions.length && <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">No charges linked yet.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function TasksTab({ s, onChange }) {
  const lk = useLookups();
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState(null);
  const [due, setDue] = useState(null);
  const add = async () => {
    if (!text.trim()) return;
    await attempt(() => post(`/subscriptions/${s.id}/tasks`, { text, assignee_id: assignee ? Number(assignee) : null, due_date: due }), 'Task added');
    setText(''); setAssignee(null); setDue(null); onChange();
  };
  return (
    <Paper withBorder p="md" radius="md">
      <Stack>
        <TaskList tasks={s.tasks} onChange={onChange} />
        <Group align="flex-end" wrap="wrap">
          <TextInput label="New task" placeholder="e.g. Ask for NGO discount before renewal" value={text} onChange={(e) => setText(e.currentTarget.value)} style={{ flex: 1, minWidth: 220 }} />
          <Select label="Assignee" data={lk.people.map((p) => ({ value: String(p.id), label: p.name }))} value={assignee} onChange={setAssignee} clearable searchable w={200} />
          <DateInput label="Due" value={due} onChange={setDue} clearable w={150} valueFormat="DD MMM YYYY" />
          <Button leftSection={<IconPlus size={16} />} onClick={add} disabled={!text.trim()}>Add</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function TaskList({ tasks, onChange, showProduct = false }) {
  const toggle = async (t) => { await attempt(() => patch(`/tasks/${t.id}`, { done: t.done ? 0 : 1 })); onChange(); };
  const remove = async (t) => { await attempt(() => del(`/tasks/${t.id}`)); onChange(); };
  const today = new Date().toISOString().slice(0, 10);
  if (!tasks.length) return <Text size="sm" c="dimmed">No tasks.</Text>;
  return (
    <Stack gap="xs">
      {tasks.map((t) => (
        <Group key={t.id} justify="space-between" wrap="nowrap" align="flex-start">
          <Checkbox checked={!!t.done} onChange={() => toggle(t)} label={
            <div>
              <Text size="sm" td={t.done ? 'line-through' : undefined} c={t.done ? 'dimmed' : undefined}>{t.text}</Text>
              <Text size="xs" c="dimmed">
                {showProduct && t.product && <><Anchor component={Link} to={`/subscriptions/${t.subscription_id}`} size="xs">{t.product}</Anchor> · </>}
                {t.assignee_name || 'Unassigned'}
                {t.due_date && <> · <Text span size="xs" c={!t.done && t.due_date < today ? 'red' : 'dimmed'}>due {fmtDate(t.due_date)}</Text></>}
              </Text>
            </div>
          } />
          <ActionIcon variant="subtle" color="gray" onClick={() => remove(t)} aria-label="Delete task"><IconTrash size={14} /></ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
