INSERT INTO tasks (id, title, description, status, due_date)
VALUES
  (1, 'お皿洗い', 'お皿洗い', 'todo', date('now')),
  (2, '普通洗濯', '普通洗濯', 'todo', date('now')),
  (3, 'おしゃれ着洗濯', 'おしゃれ着洗濯', 'todo', date('now'))
ON CONFLICT(id) DO NOTHING;
