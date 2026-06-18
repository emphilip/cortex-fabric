-- Append-only audit log. Immutable by trigger; only legal_hold may be flipped on.
-- Partition by week so retention is a single DROP per partition.

CREATE TABLE opencg.audit_log (
  id                 BIGSERIAL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id     TEXT NOT NULL,
  tenant             TEXT NOT NULL,
  principal          TEXT NOT NULL,
  roles              TEXT[] NOT NULL,
  tool               TEXT NOT NULL,
  query              TEXT NOT NULL,
  intent_plan        JSONB,
  retriever_versions JSONB,
  model_versions     JSONB,
  vector_collection  TEXT,
  vector_snapshot_id TEXT,
  candidate_ids      UUID[] NOT NULL DEFAULT '{}',
  candidate_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_entity_ids   UUID[] NOT NULL DEFAULT '{}',
  final_context_hash TEXT NOT NULL,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  latency_ms         INTEGER NOT NULL DEFAULT 0,
  outcome            TEXT NOT NULL DEFAULT 'ok',
  error_code         TEXT,
  legal_hold         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX audit_log_correlation_ix ON opencg.audit_log (correlation_id);
CREATE INDEX audit_log_principal_ix   ON opencg.audit_log (principal, created_at DESC);
CREATE INDEX audit_log_tenant_ix      ON opencg.audit_log (tenant, created_at DESC);

-- Default partition catches rows outside an explicit weekly partition. A
-- future enrichment job pre-creates next-week partitions.
CREATE TABLE opencg.audit_log_default PARTITION OF opencg.audit_log DEFAULT;

-- Immutability: forbid DELETE entirely; allow UPDATE only when the sole change
-- is legal_hold flipping FALSE -> TRUE. Implemented by overwriting NEW's
-- legal_hold with OLD's and asserting row-equality with OLD.
CREATE OR REPLACE FUNCTION opencg.audit_log_immutable()
RETURNS TRIGGER AS $$
DECLARE
  legal_hold_change BOOLEAN := (NEW.legal_hold IS DISTINCT FROM OLD.legal_hold);
  cmp opencg.audit_log;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_log: DELETE forbidden';
  END IF;

  IF legal_hold_change AND OLD.legal_hold = TRUE AND NEW.legal_hold = FALSE THEN
    RAISE EXCEPTION 'audit_log: cannot clear legal_hold';
  END IF;

  -- Build a synthetic NEW with the original legal_hold; everything else must
  -- match OLD or we reject.
  cmp := NEW;
  cmp.legal_hold := OLD.legal_hold;
  IF cmp IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'audit_log: only legal_hold may be updated';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE OR DELETE ON opencg.audit_log
FOR EACH ROW EXECUTE FUNCTION opencg.audit_log_immutable();
