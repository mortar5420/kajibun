
import { MantineProvider, Container } from '@mantine/core';
import { TaskList } from './components/TaskList';
import { mockTasks } from './mocks/tasks';
import '@mantine/core/styles.css';

function App() {
  return (
    <MantineProvider>
      <Container size="md" py="xl">
        <TaskList tasks={mockTasks} />
      </Container>
    </MantineProvider>
  );
}

export default App;
