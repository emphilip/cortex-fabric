import Link from "next/link";
import type { Entity } from "@hive-mind/shared";

const BODY_PREVIEW_CHARS = 50_000;

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div
        style={{
          fontFamily: typeof value === "string" && value.length > 20 ? "monospace" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export interface EntityDetailProps {
  entity: Entity;
  showFullBody?: boolean;
  onToggleFullBody?: () => void;
  onTombstone?: () => void;
}

export function EntityDetail({
  entity,
  showFullBody = false,
  onToggleFullBody,
  onTombstone,
}: EntityDetailProps) {
  const tombstoned = entity.tombstoned_at != null;
  const bodyTooLong = entity.body.length > BODY_PREVIEW_CHARS;
  const bodyShown = showFullBody ? entity.body : entity.body.slice(0, BODY_PREVIEW_CHARS);

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "monospace" }}>
          {entity.title ?? entity.source_uri}
        </h2>
        {tombstoned ? (
          <span
            style={{
              color: "var(--error)",
              background: "#fee2e2",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Tombstoned at {new Date(entity.tombstoned_at as string).toLocaleString()}
          </span>
        ) : null}
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <Pair label="entity_id" value={entity.entity_id} />
        <Pair label="source" value={entity.source} />
        <Pair label="source_uri" value={entity.source_uri} />
        <Pair label="classification" value={entity.classification} />
        <Pair label="freshness_state" value={entity.freshness_state} />
        <Pair label="content_hash" value={entity.content_hash.slice(0, 16) + "…"} />
        <Pair
          label="last_verified_at"
          value={new Date(entity.last_verified_at).toLocaleString()}
        />
        <Pair
          label="ingested_at"
          value={new Date(entity.ingested_at).toLocaleString()}
        />
        <Pair
          label="updated_at"
          value={new Date(entity.updated_at).toLocaleString()}
        />
      </section>

      <section>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Lineage</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Parent</div>
            {entity.lineage.parent ? (
              <Link
                href={`/entities/${entity.lineage.parent.entity_id}`}
                style={{ fontFamily: "monospace" }}
              >
                {entity.lineage.parent.title ?? entity.lineage.parent.source_uri}
              </Link>
            ) : (
              <span style={{ color: "var(--muted)" }}>—</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              Children ({entity.lineage.children.length})
            </div>
            {entity.lineage.children.length === 0 ? (
              <span style={{ color: "var(--muted)" }}>—</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                {entity.lineage.children.map((c) => (
                  <li key={c.entity_id} style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <Link href={`/entities/${c.entity_id}`}>
                      {c.title ?? c.source_uri}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>Body</h3>
          {bodyTooLong ? (
            <button
              type="button"
              onClick={onToggleFullBody}
              style={{
                fontSize: 12,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {showFullBody ? "Collapse" : `Show full body (${entity.body.length} chars)`}
            </button>
          ) : null}
        </header>
        <pre
          style={{
            marginTop: 8,
            maxHeight: 400,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {bodyShown}
          {!showFullBody && bodyTooLong ? "\n\n… (truncated)" : ""}
        </pre>
      </section>

      <section>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Metadata</h3>
        <pre
          style={{
            margin: 0,
            maxHeight: 200,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {JSON.stringify(entity.metadata, null, 2)}
        </pre>
      </section>

      <section>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          Recent audit appearances ({entity.audit_appearances.length})
        </h3>
        {entity.audit_appearances.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            This entity has not appeared in recently assembled context.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {entity.audit_appearances.map((appearance) => (
              <li key={appearance.id} style={{ marginBottom: 6 }}>
                <a href={`/queries/${appearance.id}`}>
                  {appearance.query || appearance.tool}
                </a>{" "}
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  {new Date(appearance.created_at).toLocaleString()} ·{" "}
                  {appearance.outcome}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!tombstoned && onTombstone ? (
        <section
          style={{
            border: "1px solid var(--error)",
            borderRadius: 6,
            padding: 12,
            background: "#fef2f2",
          }}
        >
          <strong style={{ color: "var(--error)" }}>Tombstone entity</strong>
          <p style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
            Soft-delete this entity. It will be excluded from future retrievals.
            This action is reversible only by re-ingesting the source.
          </p>
          <button
            type="button"
            onClick={onTombstone}
            style={{
              marginTop: 6,
              background: "var(--error)",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Tombstone
          </button>
        </section>
      ) : null}
    </article>
  );
}
