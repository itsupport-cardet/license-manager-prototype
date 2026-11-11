import { Link, useNavigate } from 'react-router-dom';
import { SimpleGrid, Paper, Text, Group, Title, Stack, Grid, Table, Anchor, Skeleton, Alert, Badge } from '@mantine/core';
import { BarChart, BarsList } from '@mantine/charts';
import { IconAlertTriangle } from '../icons.js';
import { useApi } from '../api.js';
import { eur, eurShort, RenewalBadge } from '../format.jsx';
import PageHeader from '../components/PageHeader.jsx';

function Kpi({ label, value, hint, to, tone }) {
  const nav = useNavigate();
  return (
    <Paper withBorder p="md" radius="md" onClick={to ? () => nav(to) : undefined} className={to ? 'clickable-row' : undefined}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text className="kpi-value" fz={28} fw={700} mt={4} c={tone}>{value}</Text>
      {hint && <Text size="xs" c="dimmed" mt={2}>{hint}</Text>}
    </Paper>
  );
}

function Panel({ title, subtitle, children, action }) {
  return (
    <Paper withBorder p="md" radius="md" h="100%">
      <Group justify="space-between" align="flex-start" mb="sm">
        <div>
          <Text fw={600}>{title}</Text>
          {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
        </div>
        {action}
      </Group>
      {children}
    </Paper>
  );
}

export default function Dashboard() {
  const { data, loading } = useApi('/dashboard');
  if (loading && !data) return <Stack><Skeleton h={40} /><SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>{[1, 2, 3, 4].map((i) => <Skeleton key={i} h={110} />)}</SimpleGrid><Skeleton h={320} /></Stack>;
  if (!data) return null;
  const k = data.kpis;
  const bars = (rows) => rows.map((r) => ({ ...r, color: 'var(--series-1)' }));

  return (
    <Stack gap="md">
      <PageHeader title="Dashboard" subtitle="Spend, renewals and open actions across all CARDET entities" />

      {(k.overdue > 0) && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
          <Group justify="space-between">
            <span><b>{k.overdue} renewal dates have passed</b> on subscriptions that are not set to auto-renew. Confirm whether they renewed or were cancelled.</span>
            <Anchor component={Link} to="/renewals" size="sm" fw={600}>Review renewals →</Anchor>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <Kpi label="Annual spend" value={eurShort(k.annual_eur)} hint={`≈ ${eur(k.monthly_eur)} per month · ${k.active} active subscriptions`} to="/subscriptions" />
        <Kpi label="Renewing in 30 days" value={k.renewals_30} hint={`${k.overdue} overdue for confirmation`} to="/renewals" tone={k.renewals_30 ? 'orange' : undefined} />
        <Kpi label="Charges to reconcile" value={k.unmatched_tx + k.suggested_tx} hint={`${k.suggested_tx} auto-matched, waiting for confirmation`} to="/transactions" />
        <Kpi label="Need attention" value={k.needs_review} hint={`subscriptions with missing or doubtful data · ${k.open_tasks} open tasks`} to="/health" />
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Panel title="Expected charges, next 12 months" subtitle="Monthly subscriptions plus annual / multi-year renewals, in EUR">
            <BarChart h={260} data={data.cashflow} dataKey="label" type="stacked" withLegend
              legendProps={{ verticalAlign: 'top', height: 36 }}
              valueFormatter={(v) => eur(v)} gridAxis="y" tickLine="none" barProps={{ radius: [4, 4, 0, 0] }}
              series={[
                { name: 'monthly', label: 'Monthly subscriptions', color: 'var(--series-1)' },
                { name: 'renewals', label: 'Renewals', color: 'var(--series-2)' },
              ]} />
          </Panel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Panel title="Next renewals" action={<Anchor component={Link} to="/renewals" size="xs">All renewals</Anchor>}>
            <Table verticalSpacing={6} fz="sm">
              <Table.Tbody>
                {data.upcoming.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/subscriptions/${s.id}`} size="sm" fw={500}>{s.product}</Anchor>
                      <Text size="xs" c="dimmed">{eur(s.charge_eur)}{s.auto_renew ? ' · auto-renews' : ''}</Text>
                    </Table.Td>
                    <Table.Td ta="right"><RenewalBadge renewal={s.renewal} withDate={false} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Panel>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <Panel title="Annual spend by department" subtitle="Shared tools are split evenly across their departments">
            <BarsList data={bars(data.byDepartment)} valueFormatter={(v) => eur(v)} barsLabel="Department" valueLabel="Per year" />
          </Panel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <Panel title="Top vendors" subtitle="Annualised, EUR">
            <BarsList data={bars(data.byVendor)} valueFormatter={(v) => eur(v)} barsLabel="Vendor" valueLabel="Per year" />
          </Panel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
          <Stack h="100%">
            <Panel title="By payment method">
              <BarsList data={bars(data.byCard)} valueFormatter={(v) => eur(v)} barsLabel="Card" valueLabel="Per year" />
            </Panel>
            <Panel title="By entity & billing cycle">
              <Group gap={6} mb="xs">{data.byEntity.map((e) => <Badge key={e.name} variant="default" size="lg" fw={500}>{e.name}: {eur(e.value)}</Badge>)}</Group>
              <Group gap={6}>{data.byCycle.map((e) => <Badge key={e.name} variant="light" color="gray" size="lg" fw={500}>{e.name}: {eur(e.value)}</Badge>)}</Group>
            </Panel>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
