-- The `cortex` role is the only application user. The image creates it from
-- POSTGRES_USER/POSTGRES_PASSWORD; grants here scope the role to the cortex
-- schema specifically.
GRANT USAGE ON SCHEMA cortex TO cortex;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA cortex TO cortex;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cortex TO cortex;

ALTER DEFAULT PRIVILEGES IN SCHEMA cortex
  GRANT SELECT, INSERT, UPDATE ON TABLES TO cortex;
ALTER DEFAULT PRIVILEGES IN SCHEMA cortex
  GRANT USAGE, SELECT ON SEQUENCES TO cortex;

-- AGE graph access.
GRANT USAGE ON SCHEMA ag_catalog TO cortex;
GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO cortex;
