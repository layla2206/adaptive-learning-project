-- The admin dashboard's Deactivate/Reactivate buttons for instructors and
-- courses never had a real column behind them -- the API hardcoded
-- status: "active" for every row, so the toggle only ever changed local
-- React state and silently reverted on reload. This adds the real column.
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';