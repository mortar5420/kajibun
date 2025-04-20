import { Card, Text, Badge, Group, Stack, Title } from '@mantine/core';
import { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
}

const getStatusColor = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return 'blue';
    case 'in_progress':
      return 'yellow';
    case 'done':
      return 'green';
    default:
      return 'gray';
  }
};

const getStatusLabel = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return '未着手';
    case 'in_progress':
      return '進行中';
    case 'done':
      return '完了';
    default:
      return '不明';
  }
};

export const TaskList = ({ tasks }: TaskListProps) => {
  return (
    <Stack gap="md">
      <Title order={2}>今日のタスク</Title>
      {tasks.map((task) => (
        <Card key={task.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>{task.title}</Text>
            <Badge color={getStatusColor(task.status)}>
              {getStatusLabel(task.status)}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            {task.description}
          </Text>

          <Group mt="md" gap="xs">
            <Text size="sm" c="dimmed">
              担当: {task.assignee}
            </Text>
            <Text size="sm" c="dimmed">
              期限: {task.dueDate}
            </Text>
          </Group>
        </Card>
      ))}
    </Stack>
  );
};
import { Card, Text, Badge, Group, Stack, Title } from '@mantine/core';
import { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
}

const getStatusColor = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return 'blue';
    case 'in_progress':
      return 'yellow';
    case 'done':
      return 'green';
    default:
      return 'gray';
  }
};

const getStatusLabel = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return '未着手';
    case 'in_progress':
      return '進行中';
    case 'done':
      return '完了';
    default:
      return '不明';
  }
};

export const TaskList = ({ tasks }: TaskListProps) => {
  return (
    <Stack gap="md">
      <Title order={2}>今日のタスク</Title>
      {tasks.map((task) => (
        <Card key={task.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={500}>{task.title}</Text>
            <Badge color={getStatusColor(task.status)}>
              {getStatusLabel(task.status)}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            {task.description}
          </Text>

          <Group mt="md" gap="xs">
            <Text size="sm" c="dimmed">
              担当: {task.assignee}
            </Text>
            <Text size="sm" c="dimmed">
              期限: {task.dueDate}
            </Text>
          </Group>
        </Card>
      ))}
    </Stack>
  );
};

