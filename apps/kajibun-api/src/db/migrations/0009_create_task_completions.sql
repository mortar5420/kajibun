ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE task_completions (
  id TEXT PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  performed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  performed_at TEXT NOT NULL,
  task_title_snapshot TEXT NOT NULL,
  due_date_snapshot TEXT,
  takeover_from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  takeover_at TEXT,
  takeover_due_date TEXT,
  classification TEXT NOT NULL CHECK (classification IN ('normal', 'overdue_takeover', 'unknown')),
  legacy_event_id INTEGER UNIQUE REFERENCES task_events(id),
  CHECK (classification != 'overdue_takeover' OR (takeover_at IS NOT NULL AND takeover_due_date IS NOT NULL))
);

CREATE INDEX idx_task_completions_performed_at ON task_completions(performed_at);
CREATE INDEX idx_task_completions_user_date ON task_completions(performed_by_user_id, performed_at);
CREATE INDEX idx_task_events_task_type_id ON task_events(task_id, event_type, id);

-- Historical completion events have no reliable deadline/takeover snapshot.
-- Keep their counts and titles without guessing whether they were takeovers.
INSERT INTO task_completions (
  id, task_id, performed_by_user_id, performed_at, task_title_snapshot,
  classification, legacy_event_id
)
SELECT
  'legacy-' || e.id, e.task_id, e.actor_user_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', e.created_at),
  COALESCE(json_extract(e.payload_json, '$.title'), t.title),
  'unknown', e.id
FROM task_events e
JOIN tasks t ON t.id = e.task_id
WHERE e.event_type = 'TaskCompleted';
