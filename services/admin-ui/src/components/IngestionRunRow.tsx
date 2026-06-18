import type { IngestionRun } from "@opencg/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface IngestionRunRowProps {
  run: IngestionRun;
}

function statusBadge(status: IngestionRun["status"]): {
  variant: "secondary" | "destructive" | "outline";
  className: string;
} {
  switch (status) {
    case "succeeded":
      return {
        variant: "secondary",
        className: "text-emerald-600 dark:text-emerald-400",
      };
    case "failed":
      return { variant: "destructive", className: "" };
    case "running":
      return {
        variant: "secondary",
        className: "text-amber-600 dark:text-amber-400",
      };
    default:
      return { variant: "outline", className: "text-muted-foreground" };
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
  const s = statusBadge(run.status);
  return (
    <div className="grid grid-cols-[100px_1fr_100px_90px_90px_90px] items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <Badge
        variant={s.variant}
        className={cn("justify-center px-2 py-0.5 text-[11px]", s.className)}
      >
        {run.status}
      </Badge>
      <span className="min-w-0">
        <span
          className="block truncate font-mono text-xs"
          title={run.repo ?? run.run_id}
        >
          {run.repo ?? run.run_id}
        </span>
        {run.error ? (
          <span className="block text-[11px] text-red-600 dark:text-red-400">
            {run.error}
          </span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">
        {new Date(run.started_at).toLocaleTimeString()}
      </span>
      <span className="text-right text-xs text-muted-foreground">
        {formatDuration(durationMs(run))}
      </span>
      <span className="text-right text-xs">{run.parents ?? "—"} files</span>
      <span className="text-right text-xs">{run.chunks ?? "—"} chunks</span>
    </div>
  );
}
