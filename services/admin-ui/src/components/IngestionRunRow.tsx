import type { IngestionRun } from "@hive-mind/shared";

export interface IngestionRunRowProps {
  run: IngestionRun;
}

function statusStyle(status: IngestionRun["status"]): {
  color: string;
  bg: string;
} {
  switch (status) {
    case "succeeded":
      return { color: "var(--success)", bg: "#dcfce7" };
    case "failed":
      return { color: "var(--error)", bg: "#fee2e2" };
    case "running":
      return { color: "var(--accent)", bg: "#e0e7ff" };
    default:
      return { color: "var(--muted)", bg: "var(--code-bg)" };
  }
}

function durationMs(run: IngestionRun): number | null {
  if (!run.finished_at) return null;
  return new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} m`;
}

export function IngestionRunRow({ run }: IngestionRunRowProps) {
  const s = statusStyle(run.status);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 100px 90px 90px 90px",
        gap: 12,
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: s.color,
          background: s.bg,
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        {run.status}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
            fontSize: 12,
          }}
          title={run.repo ?? run.run_id}
        >
          {run.repo ?? run.run_id}
        </span>
        {run.error ? (
          <span style={{ display: "block", color: "var(--error)", fontSize: 11 }}>
            {run.error}
          </span>
        ) : null}
      </span>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>
        {new Date(run.started_at).toLocaleTimeString()}
      </span>
      <span style={{ color: "var(--muted)", fontSize: 12, textAlign: "right" }}>
        {formatDuration(durationMs(run))}
      </span>
      <span style={{ fontSize: 12, textAlign: "right" }}>
        {run.parents ?? "—"} files
      </span>
      <span style={{ fontSize: 12, textAlign: "right" }}>
        {run.chunks ?? "—"} chunks
      </span>
    </div>
  );
}
