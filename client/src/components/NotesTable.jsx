import { useState } from 'react';
import { Paper, Table, Text, Textarea, Button, Group, ActionIcon, Tooltip, Stack } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash, IconPlus, IconCheck, IconX } from '../icons.js';
import { post, put, del, attempt } from '../api.js';

// SQLite stores UTC "YYYY-MM-DD HH:MM:SS"
const when = (ts) => (ts ? new Date(`${ts.replace(' ', 'T')}Z`).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '');

/** All notes of a subscription as a table: add, edit inline, delete. Newest first. */
export default function NotesTable({ subscriptionId, notes, onChange }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [busy, setBusy] = useState(false);
  const base = `/subscriptions/${subscriptionId}/notes`;

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try { await attempt(() => post(base, { text: draft }), 'Note added'); setDraft(''); onChange(); } finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!editing?.text.trim()) return;
    await attempt(() => put(`${base}/${editing.id}`, { text: editing.text }), 'Note updated');
    setEditing(null); onChange();
  };
  const remove = (n) => modals.openConfirmModal({
    title: 'Delete this note?',
    children: <Text size="sm" lineClamp={4}>{n.text}</Text>,
    labels: { confirm: 'Delete', cancel: 'Keep' }, confirmProps: { color: 'red' },
    onConfirm: async () => { await attempt(() => del(`${base}/${n.id}`), 'Note deleted'); onChange(); },
  });

  return (
    <Paper withBorder p="md" radius="md">
      <Stack>
        <Group align="flex-end" wrap="nowrap">
          <Textarea style={{ flex: 1 }} label="Add a note" placeholder="e.g. Asked vendor for NGO pricing, waiting for reply"
            autosize minRows={1} maxRows={6} value={draft} onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }} />
          <Button leftSection={<IconPlus size={16} />} onClick={add} loading={busy} disabled={!draft.trim()}>Add</Button>
        </Group>
        <Text size="xs" c="dimmed" mt={-8}>Tip: Ctrl+Enter adds the note.</Text>

        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={170}>Date</Table.Th>
              <Table.Th>Note</Table.Th>
              <Table.Th w={170}>Author</Table.Th>
              <Table.Th w={80} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {notes.map((n) => (
              <Table.Tr key={n.id} style={{ verticalAlign: 'top' }}>
                <Table.Td>
                  <Text size="sm">{when(n.created_at)}</Text>
                  {n.updated_at && <Text size="xs" c="dimmed">edited {when(n.updated_at)}</Text>}
                </Table.Td>
                <Table.Td>
                  {editing?.id === n.id ? (
                    <Textarea autosize minRows={2} autoFocus value={editing.text}
                      onFocus={(e) => { const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
                      onChange={(e) => { const text = e.currentTarget.value; setEditing((p) => ({ ...p, text })); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(); if (e.key === 'Escape') setEditing(null); }} />
                  ) : (
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.text}</Text>
                  )}
                </Table.Td>
                <Table.Td><Text size="sm" c={n.author === 'Spreadsheet import' ? 'dimmed' : undefined}>{n.author || '—'}</Text></Table.Td>
                <Table.Td>
                  {editing?.id === n.id ? (
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Save"><ActionIcon color="teal" variant="light" onClick={saveEdit} aria-label="Save note"><IconCheck size={16} /></ActionIcon></Tooltip>
                      <Tooltip label="Cancel"><ActionIcon variant="subtle" color="gray" onClick={() => setEditing(null)} aria-label="Cancel edit"><IconX size={16} /></ActionIcon></Tooltip>
                    </Group>
                  ) : (
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Edit"><ActionIcon variant="subtle" onClick={() => setEditing({ id: n.id, text: n.text })} aria-label="Edit note"><IconEdit size={16} /></ActionIcon></Tooltip>
                      <Tooltip label="Delete"><ActionIcon variant="subtle" color="red" onClick={() => remove(n)} aria-label="Delete note"><IconTrash size={16} /></ActionIcon></Tooltip>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {!notes.length && (
              <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed" ta="center" py="sm">No notes yet.</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}
