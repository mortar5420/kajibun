import { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
}

const getStatusColor = (status: Task['status']) => {
  switch (status) {
    case 'todo':
      return 'bg-blue-500';
    case 'in_progress':
      return 'bg-yellow-500';
    case 'done':
      return 'bg-green-500';
    default:
      return 'bg-gray-500';
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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6">今日のタスク</h2>
      <div className="grid gap-6">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-lg shadow-md border border-gray-200 p-4 sm:p-6"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
              <h3 className="text-lg sm:text-xl font-medium mb-2 sm:mb-0">
                {task.title}
              </h3>
              <span
                className={`${getStatusColor(
                  task.status
                )} text-white px-3 py-1 rounded-full text-sm`}
              >
                {getStatusLabel(task.status)}
              </span>
            </div>

            <p className="text-gray-600 text-sm sm:text-base mb-4">
              {task.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-gray-500 text-sm">
              <span>担当: {task.assignee}</span>
              <span>期限: {task.dueDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
