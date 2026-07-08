ALTER TABLE tasks ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days > 0);
