import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink as RouterLink, useLocation, Navigate } from 'react-router-dom';
import {
  AppShell, Burger, Group, NavLink, Text, ActionIcon, Tooltip, Center, Loader, Badge, Menu, Avatar,
  useMantineColorScheme, useComputedColorScheme, ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutDashboard, IconApps, IconCalendarDue, IconUsers, IconReceipt2, IconChecklist, IconHeartRateMonitor,
  IconSettings, IconSun, IconMoon, IconLogout, IconCheck,
} from './icons.js';
import { get, post, useApi } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import SubscriptionDetail from './pages/SubscriptionDetail.jsx';
import Renewals from './pages/Renewals.jsx';
import People from './pages/People.jsx';
import PersonDetail from './pages/PersonDetail.jsx';
import Transactions from './pages/Transactions.jsx';
import Tasks from './pages/Tasks.jsx';
import DataHealth from './pages/DataHealth.jsx';
import Settings from './pages/Settings.jsx';

const LookupsContext = createContext(null);
export const useLookups = () => useContext(LookupsContext);

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/subscriptions', label: 'Subscriptions', icon: IconApps },
  { to: '/renewals', label: 'Renewals', icon: IconCalendarDue, badge: 'renewals' },
  { to: '/people', label: 'People & seats', icon: IconUsers },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt2, badge: 'tx' },
  { to: '/tasks', label: 'Tasks', icon: IconChecklist, badge: 'tasks' },
  { to: '/health', label: 'Data health', icon: IconHeartRateMonitor },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    get('/auth/me').then(setUser).catch(() => setUser(null));
    const onLogout = () => setUser(null);
    window.addEventListener('lm:logout', onLogout);
    return () => window.removeEventListener('lm:logout', onLogout);
  }, []);

  if (user === undefined) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Login onLogin={setUser} />;
  return <Shell user={user} onLogout={async () => { await post('/auth/logout'); setUser(null); }} />;
}

function Shell({ user, onLogout }) {
  const [opened, { toggle, close }] = useDisclosure();
  const lookups = useApi('/lookups');
  const counts = useApi('/dashboard');
  const location = useLocation();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  // Refresh nav counters whenever the page changes
  const reloadCounts = counts.reload;
  useEffect(() => { reloadCounts(); close(); }, [location.pathname, reloadCounts, close]);

  const refreshAll = useCallback(() => { lookups.reload(); counts.reload(); }, [lookups, counts]);

  const k = counts.data?.kpis;
  const badgeFor = (key) => {
    if (!k) return null;
    if (key === 'renewals' && (k.overdue || k.renewals_30)) {
      return <Badge size="xs" color={k.overdue ? 'red' : 'orange'} circle={false}>{k.overdue + k.renewals_30}</Badge>;
    }
    if (key === 'tx' && k.unmatched_tx + k.suggested_tx) return <Badge size="xs" variant="light">{k.unmatched_tx + k.suggested_tx}</Badge>;
    if (key === 'tasks' && k.open_tasks) return <Badge size="xs" variant="light" color="gray">{k.open_tasks}</Badge>;
    return null;
  };

  if (!lookups.data) return <Center h="100vh"><Loader /></Center>;

  return (
    <LookupsContext.Provider value={{ ...lookups.data, reload: lookups.reload, refreshAll, user }}>
      <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              <ThemeIcon size={30} radius="md" variant="filled"><IconCheck size={18} stroke={3} /></ThemeIcon>
              <div>
                <Text fw={700} size="sm" lh={1.1}>CARDET License Manager</Text>
                <Text size="xs" c="dimmed" lh={1.1} visibleFrom="xs">Software &amp; subscriptions · prototype</Text>
              </div>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Tooltip label={scheme === 'dark' ? 'Light mode' : 'Dark mode'}>
                <ActionIcon variant="default" size="lg" aria-label="Toggle colour scheme"
                  onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}>
                  {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                </ActionIcon>
              </Tooltip>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" size="lg" radius="xl" aria-label="Account">
                    <Avatar size={32} radius="xl" color="indigo">{initials(user.name)}</Avatar>
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Signed in as {user.name}</Menu.Label>
                  <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>Log out</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="xs">
          {NAV.map((n) => (
            <NavLink key={n.to} component={RouterLink} to={n.to} end={n.to === '/'} label={n.label}
              leftSection={<n.icon size={18} stroke={1.6} />} rightSection={n.badge ? badgeFor(n.badge) : null}
              active={n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)}
              style={{ borderRadius: 8 }} />
          ))}
          <Text size="xs" c="dimmed" mt="auto" p="xs">
            Demo data imported from “SaaS / Software Inventory V2.xlsx”.
          </Text>
        </AppShell.Navbar>

        <AppShell.Main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
            <Route path="/renewals" element={<Renewals />} />
            <Route path="/people" element={<People />} />
            <Route path="/people/:id" element={<PersonDetail />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/health" element={<DataHealth />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell.Main>
      </AppShell>
    </LookupsContext.Provider>
  );
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
