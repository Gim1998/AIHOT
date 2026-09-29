-- Retire the previous industry's public directory without deleting its historical definitions.
ALTER TABLE topics ADD COLUMN active boolean NOT NULL DEFAULT true;
