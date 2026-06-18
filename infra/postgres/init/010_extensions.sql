-- Core extensions. AGE is preinstalled in the apache/age image.
CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Knowledge graph (named-relationship vocabulary lives in a normal table; the
-- AGE graph itself is bootstrapped here but unused by the thin MVP).
SELECT create_graph('opencg');
