import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Stack, Paper, Table, Text, Badge, Group, Button, SegmentedControl, Select, ActionIcon, Tooltip, Modal, Textarea,
  FileButton, Alert, ScrollArea, Anchor, Skeleton,
} from '@mantine/core';
import { IconUpload, IconCheck, IconX, IconEyeOff, IconWand, IconFileSpreadsheet } from '../icons.js';
import Papa from 'papaparse';
import { useApi, post, attempt, notifyOk } from '../api.js';
import { useLookups } from '../App.jsx';
import { eur, money, fmtDate, options } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

const STATUS_COLOR = { unmatched: 'red', suggested: 'yellow', confirmed: 'teal', ignored: 'gray' };

export default function Transactions() {
  const [status, setStatus] = useState('open');
  const { data, reload } = useApi('/transactions');
  const subs = useApi('/subscriptions');
  const lk = useLookups();
  const [importing, setImporting] = useState(false);
  const refresh = () => { reload(); lk.refreshAll(); };

  const subOptions = useMemo(() => (subs.data || []).map((s) => ({ value: String(s.id), label: s.status === 'active' ? s.product : `${s.product} (${s.status})` })), [subs.data]);
  const rows = (data || []).filter((t) => status === 'all' || (status === 'open' ? ['unmatched', 'suggested'].includes(t.match_status) : t.match_status === status));
  const count = (st) => (data || []).filter((t) => t.match_status === st).length;

  const confirm = async (t, subscription_id) => { await attempt(() => post(`/transactions/${t.id}/confirm`, subscription_id ? { subscription_id: Number(subscription_id) } : {}), 'Charge linked'); refresh(); };
  const act = async (t, action, msg) => { await attempt(() => post(`/transactions/${t.id}/${action}`), msg); refresh(); };
  const rematch = async () => { const r = await attempt(() => post('/transactions/rematch')); notifyOk(`Re-checked ${r.checked} charges, ${r.suggested} matched`); refresh(); };
  const confirmAll = async () => {
    const strong = rows.filter((t) => t.match_status === 'suggested' && t.match_score >= 80);
    for (const t of strong) await post(`/transactions/${t.id}/confirm`, {});
    notifyOk(`Confirmed ${strong.length} strong matches`);
    refresh();
  };

  return (
    <Stack>
      <PageHeader title="Transactions" subtitle="Card and bank charges matched to subscriptions: find unknown spend and confirm what we pay for">
        <Button variant="default" leftSection={<IconWand size={16} />} onClick={rematch}>Re-run matching</Button>
        <Button leftSection={<IconUpload size={16} />} onClick={() => setImporting(true)}>Import statement</Button>
      </PageHeader>

      <Group justify="space-between">
        <SegmentedControl value={status} onChange={setStatus} data={[
          { value: 'open', label: `To review (${count('unmatched') + count('suggested')})` },
          { value: 'confirmed', label: `Confirmed (${count('confirmed')})` },
          { value: 'ignored', label: `Ignored (${count('ignored')})` },
          { value: 'all', label: 'All' },
        ]} />
        {status === 'open' && rows.some((t) => t.match_status === 'suggested' && t.match_score >= 80) && (
          <Button variant="light" size="sm" leftSection={<IconCheck size={16} />} onClick={confirmAll}>Confirm all strong matches (score ≥ 80)</Button>
        )}
      </Group>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table verticalSpacing="sm" miw={980}>
            <Table.Thead><Table.Tr>
              <Table.Th>Date</Table.Th><Table.Th>Statement line</Table.Th><Table.Th ta="right">Amount</Table.Th>
              <Table.Th>Card / entity</Table.Th><Table.Th>Subscription</Table.Th><Table.Th ta="right">Actions</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {!data && <Table.Tr><Table.Td colSpan={6}><Skeleton h={28} /></Table.Td></Table.Tr>}
              {rows.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}><Text size="sm">{fmtDate(t.date)}</Text></Table.Td>
                  <Table.Td maw={340}>
                    <Text className="mono" lineClamp={2}>{t.raw_description}</Text>
                    {t.note && <Text size="xs" c="dimmed">Note: {t.note}</Text>}
                  </Table.Td>
                  <Table.Td className="num">
                    <Text size="sm" fw={500}>{eur(t.amount_eur, true)}</Text>
                    {t.orig_currency && t.orig_currency !== 'EUR' && <Text size="xs" c="dimmed">{money(t.orig_amount, t.orig_currency)}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm">{t.card_last4 ? `••• ${t.card_last4}` : '—'}</Text><Text size="xs" c="dimmed">{t.entity_name}</Text></Table.Td>
                  <Table.Td miw={260}>
                    {t.match_status === 'confirmed' || t.match_status === 'ignored' ? (
                      <Group gap={6}>
                        <Badge size="sm" variant="light" color={STATUS_COLOR[t.match_status]}>{t.match_status}</Badge>
                        {t.subscription_id && <Anchor component={Link} to={`/subscriptions/${t.subscription_id}`} size="sm">{t.product}</Anchor>}
                      </Group>
                    ) : (
                      <Stack gap={4}>
                        <Select size="xs" placeholder="Choose subscription…" data={subOptions} searchable
                          value={t.subscription_id ? String(t.subscription_id) : null}
                          onChange={(v) => v && confirm(t, v)} />
                        {t.match_status === 'suggested'
                          ? <Tooltip multiline w={260} label={t.match_reasons.join(' · ')}><Text size="xs" c="dimmed" style={{ cursor: 'help' }}>Suggested · score {t.match_score} · why?</Text></Tooltip>
                          : <Text size="xs" c="red">No match found: unknown spend?</Text>}
                      </Stack>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {t.match_status === 'suggested' && <Tooltip label="Confirm suggestion"><ActionIcon color="teal" variant="light" onClick={() => confirm(t)} aria-label="Confirm"><IconCheck size={16} /></ActionIcon></Tooltip>}
                      {['suggested', 'confirmed'].includes(t.match_status) && <Tooltip label="Unlink"><ActionIcon variant="subtle" color="gray" onClick={() => act(t, 'unmatch', 'Unlinked')} aria-label="Unlink"><IconX size={16} /></ActionIcon></Tooltip>}
                      {t.match_status !== 'ignored' && <Tooltip label="Ignore (not a software charge)"><ActionIcon variant="subtle" color="gray" onClick={() => act(t, 'ignore', 'Ignored')} aria-label="Ignore"><IconEyeOff size={16} /></ActionIcon></Tooltip>}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {data && !rows.length && <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="lg">Nothing here. All charges are reconciled.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <ImportModal opened={importing} onClose={() => setImporting(false)} entities={lk.entities} onDone={refresh} />
    </Stack>
  );
}

const SAMPLE = `Date,Description,Amount
10/11/2026,OPENAI *CHATGPT SUBSCR OPENAI.COM USA 20.00 USD PURCHASE SALE CARD 4*2389,17.84
08/11/2026,ANTHROPIC ANTHROPIC.COM USA 100.00 USD PURCHASE SALE CARD 4*2389,89.12
05/11/2026,CANVA* 0423-1188 SYDNEY AUS 15.00 EUR CARD 4*4067,15.00
03/11/2026,FREEPIK COMPANY MALAGA ESP 249.89 EUR CARD 4*2389,249.89
02/11/2026,NOTION LABS INC SAN FRANCISCO 10.00 USD CARD 4*2389,8.92
01/11/2026,ZOOM.US 888-799-9666 CA 13.33 USD CARD 4*4067,11.89`;

const guess = (headers, patterns) => headers.find((h) => patterns.some((p) => p.test(h))) || null;

function ImportModal({ opened, onClose, entities, onDone }) {
  const [text, setText] = useState('');
  const [map, setMap] = useState({});
  const [entity, setEntity] = useState(null);
  const [result, setResult] = useState(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const r = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
    const headers = r.meta.fields || [];
    return { rows: r.data, headers, auto: {
      date: guess(headers, [/date/i, /ημερ/i]),
      description: guess(headers, [/desc/i, /detail/i, /narrat/i, /merchant/i, /περιγρ/i]),
      amount: guess(headers, [/amount/i, /debit/i, /eur/i, /ποσ/i]),
      card: guess(headers, [/card/i]),
    } };
  }, [text]);
  const col = (k) => map[k] ?? parsed?.auto[k] ?? null;

  const rows = (parsed?.rows || []).map((r) => ({
    date: r[col('date')], description: r[col('description')],
    amount_eur: Math.abs(Number(String(r[col('amount')] ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'))),
    card_last4: col('card') ? String(r[col('card')] || '').slice(-4) || null : null,
    entity_id: entity ? Number(entity) : null,
  })).filter((r) => r.date && r.description);

  const submit = async () => {
    const r = await attempt(() => post('/transactions/import', { rows }));
    setResult(r); onDone();
  };
  const close = () => { setText(''); setMap({}); setResult(null); onClose(); };
  const readFile = (file) => file && file.text().then(setText);
  const headerOpts = (parsed?.headers || []).map((h) => ({ value: h, label: h }));

  return (
    <Modal opened={opened} onClose={close} title="Import card / bank statement" size="xl">
      {result ? (
        <Stack>
          <Alert color="teal" title={`Imported ${result.imported} charges`}>{result.suggested} were matched automatically. Review them in “To review”.</Alert>
          {result.errors.length > 0 && <Alert color="orange" title="Skipped rows">{result.errors.map((e) => <div key={e}>{e}</div>)}</Alert>}
          <Group justify="flex-end"><Button onClick={close}>Done</Button></Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm" c="dimmed">Paste CSV exported from the bank (Bank of Cyprus, Hellenic, Revolut…) or upload the file. Needs at least a date, a description and an amount column. Dates are read as day/month/year.</Text>
          <Group gap="xs">
            <FileButton onChange={readFile} accept=".csv,text/csv,text/plain">
              {(props) => <Button {...props} variant="default" leftSection={<IconFileSpreadsheet size={16} />}>Upload CSV</Button>}
            </FileButton>
            <Button variant="subtle" onClick={() => setText(SAMPLE)}>Use sample statement</Button>
          </Group>
          <Textarea placeholder="Date,Description,Amount…" autosize minRows={5} maxRows={10} value={text} onChange={(e) => setText(e.currentTarget.value)} styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }} />
          {parsed && (
            <>
              <Group grow>
                <Select label="Date column" data={headerOpts} value={col('date')} onChange={(v) => setMap({ ...map, date: v })} />
                <Select label="Description column" data={headerOpts} value={col('description')} onChange={(v) => setMap({ ...map, description: v })} />
                <Select label="Amount (EUR) column" data={headerOpts} value={col('amount')} onChange={(v) => setMap({ ...map, amount: v })} />
                <Select label="Card column (optional)" data={headerOpts} value={col('card')} onChange={(v) => setMap({ ...map, card: v })} clearable />
              </Group>
              <Select label="Entity (whose statement is this?)" data={options(entities)} value={entity} onChange={setEntity} clearable w={300} />
              <Text size="sm" fw={500}>Preview: {rows.length} rows</Text>
              <Table fz="xs" withTableBorder>
                <Table.Tbody>{rows.slice(0, 5).map((r, i) => (
                  <Table.Tr key={i}><Table.Td>{r.date}</Table.Td><Table.Td className="mono">{r.description}</Table.Td><Table.Td className="num">{eur(r.amount_eur, true)}</Table.Td></Table.Tr>
                ))}</Table.Tbody>
              </Table>
            </>
          )}
          <Group justify="flex-end"><Button variant="default" onClick={close}>Cancel</Button><Button onClick={submit} disabled={!rows.length}>Import {rows.length || ''} rows</Button></Group>
        </Stack>
      )}
    </Modal>
  );
}
