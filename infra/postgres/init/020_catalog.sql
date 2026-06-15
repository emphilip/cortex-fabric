-- Catalog tables. These are the v0 set used by the thin MVP retrieval path.
-- Future changes (knowledge-graph, background-enrichment) extend, not replace.

CREATE SCHEMA IF NOT EXISTS cortex;

CREATE TABLE cortex.entity (
  entity_id        UUID PRIMARY KEY,
  tenant           TEXT NOT NULL,
  source           TEXT NOT NULL,
  source_uri       TEXT NOT NULL,
  source_revision  TEXT,
  parent_entity_id UUID REFERENCES cortex.entity(entity_id) ON DELETE CASCADE,
  title            TEXT,
  body             TEXT NOT NULL,                 -- raw text stored for replay + admin UI
  content_hash     TEXT NOT NULL,
  classification   TEXT NOT NULL DEFAULT 'internal',
  owner            TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness_state  TEXT NOT NULL DEFAULT 'fresh',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tombstoned_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX entity_source_uri_uq ON cortex.entity (tenant, source, source_uri);
CREATE INDEX entity_classification_ix    ON cortex.entity (tenant, classification);
CREATE INDEX entity_freshness_ix         ON cortex.entity (tenant, freshness_state);
CREATE INDEX entity_body_trgm_ix         ON cortex.entity USING gin (body gin_trgm_ops);
CREATE INDEX entity_title_trgm_ix        ON cortex.entity USING gin (title gin_trgm_ops);
CREATE INDEX entity_body_fts_ix          ON cortex.entity USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || body));
