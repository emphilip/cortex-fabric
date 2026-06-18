-- The `opencg` role is the only application user. The image creates it from
-- POSTGRES_USER/POSTGRES_PASSWORD; grants here scope the role to the opencg
-- schema specifically.
GRANT USAGE ON SCHEMA opencg TO opencg;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA opencg TO opencg;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA opencg TO opencg;

ALTER DEFAULT PRIVILEGES IN SCHEMA opencg
  GRANT SELECT, INSERT, UPDATE ON TABLES TO opencg;
ALTER DEFAULT PRIVILEGES IN SCHEMA opencg
  GRANT USAGE, SELECT ON SEQUENCES TO opencg;

-- AGE graph access.
GRANT USAGE ON SCHEMA ag_catalog TO opencg;
GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO opencg;
