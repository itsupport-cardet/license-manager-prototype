import { useState } from 'react';
import { Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Center, Alert, ThemeIcon, Group } from '@mantine/core';
import { IconCheck, IconAlertCircle } from '../icons.js';
import { post } from '../api.js';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '', name: localStorageGet('lm_name') });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      localStorageSet('lm_name', form.name);
      onLogin(await post('/auth/login', form));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-default-hover)">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Group gap="sm">
              <ThemeIcon size={40} radius="md"><IconCheck size={24} stroke={3} /></ThemeIcon>
              <div>
                <Title order={3}>License Manager</Title>
                <Text size="sm" c="dimmed">CARDET software &amp; subscriptions</Text>
              </div>
            </Group>
            {error && <Alert color="red" icon={<IconAlertCircle size={18} />}>{error}</Alert>}
            <TextInput label="Your name" description="Shown in the activity log next to your changes" placeholder="e.g. Andreas"
              value={form.name} onChange={set('name')} />
            <TextInput label="Username" required autoComplete="username" value={form.username} onChange={set('username')} />
            <PasswordInput label="Password" required autoComplete="current-password" value={form.password} onChange={set('password')} />
            <Button type="submit" loading={busy} fullWidth>Sign in</Button>
            <Text size="xs" c="dimmed" ta="center">Prototype · shared demo account provided by IT</Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

function localStorageGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
