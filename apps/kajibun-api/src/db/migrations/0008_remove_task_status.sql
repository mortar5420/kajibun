DROP INDEX IF EXISTS idx_tasks_status;

ALTER TABLE tasks DROP COLUMN status;
