import { Group, Title, Text } from '@mantine/core';

export default function PageHeader({ title, subtitle, children }) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
      <div>
        <Title order={2}>{title}</Title>
        {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
      </div>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  );
}
