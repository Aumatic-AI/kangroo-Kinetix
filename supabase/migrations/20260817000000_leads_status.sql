ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
  CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'not_interested'));
