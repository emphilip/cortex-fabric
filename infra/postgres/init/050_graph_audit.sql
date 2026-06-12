-- Audit log for state transitions on graph artifacts (concepts, edges,
-- vocabulary). Append-only with the same row-level immutability as
-- hive_mind.audit_log: a trigger blocks DELETE entirely and blocks UPDATE
-- on every column.
--
-- Required for the admin review workflow in `add-knowledge-graph`. Lives in
-- a separate init script so `040_graph.sql` (from `adopt-graphifyy`) stays
-- focused on storage shape and we can rollback this layer independently
-- if the review workflow ever needs reshaping.

CREATE TABLE hive_mind.graph_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor       TEXT NOT NULL,
  tenant      TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('concept','edge','vocab')),
  target_id   TEXT NOT NULL,
  from_state  TEXT,
  to_state    TEXT,
  reason      TEXT,
  before      JSONB,
  after       JSONB
);

CREATE INDEX graph_audit_log_target_ix
  ON hive_mind.graph_audit_log (target_id, created_at DESC);
CREATE INDEX graph_audit_log_actor_ix
  ON hive_mind.graph_audit_log (actor, created_at DESC);
CREATE INDEX graph_audit_log_tenant_ix
  ON hive_mind.graph_audit_log (tenant, created_at DESC);

-- Immutability: forbid UPDATE and DELETE on every column. No legal_hold
-- escape hatch here (mirrors the discipline of audit_log; if we need one
-- later it lands in a follow-up).
CREATE OR REPLACE FUNCTION hive_mind.graph_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'graph_audit_log: DELETE forbidden';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'graph_audit_log: UPDATE forbidden';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER graph_audit_log_no_modify
BEFORE UPDATE OR DELETE ON hive_mind.graph_audit_log
FOR EACH ROW EXECUTE FUNCTION hive_mind.graph_audit_log_immutable();

-- Apache AGE label types for the knowledge graph. We use AGE's openCypher
-- only as a queryable index over the same edges; the source of truth lives
-- in hive_mind.relationship_edge. Bootstrapping the labels here lets the
-- traversal endpoint issue Cypher without first checking-and-creating.
--
-- One Concept node label; one edge label per vocabulary entry. The label
-- names mirror the vocab `name` column verbatim.
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

DO $$
DECLARE
  v_name TEXT;
BEGIN
  -- Vertex label
  IF NOT EXISTS (
    SELECT 1 FROM ag_label
    WHERE name = 'Concept' AND graph = (SELECT graphid FROM ag_graph WHERE name = 'hive_mind')
  ) THEN
    PERFORM create_vlabel('hive_mind', 'Concept');
  END IF;

  -- Edge labels (one per vocabulary entry)
  FOR v_name IN SELECT name FROM hive_mind.relationship_vocab LOOP
    IF NOT EXISTS (
      SELECT 1 FROM ag_label
      WHERE name = v_name AND graph = (SELECT graphid FROM ag_graph WHERE name = 'hive_mind')
    ) THEN
      PERFORM create_elabel('hive_mind', v_name);
    END IF;
  END LOOP;
END
$$;

-- Grants for the application user.
GRANT SELECT, INSERT ON hive_mind.graph_audit_log TO hive;
GRANT USAGE, SELECT ON hive_mind.graph_audit_log_id_seq TO hive;
