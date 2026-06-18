import type { ConnectorStatus } from "@opencg/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ConnectorCardProps {
  connector: ConnectorStatus;
  lastRunSummary?: string;
}

export function ConnectorCard({ connector, lastRunSummary }: ConnectorCardProps) {
  return (
    <Card className={cn(!connector.supported && "bg-muted/50 opacity-70")}>
      <CardHeader className="flex-row items-baseline gap-2 space-y-0 p-4 pb-0">
        <CardTitle className="text-sm">{connector.name}</CardTitle>
        <Badge
          variant={connector.supported ? "secondary" : "outline"}
          className={cn(
            "px-1.5 py-0 text-[11px]",
            connector.supported
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          {connector.supported ? "supported" : "deferred"}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {connector.reason ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{connector.reason}</p>
        ) : null}
        {lastRunSummary ? (
          <p className="mt-1.5 text-xs">
            <span className="text-muted-foreground">last run:</span> {lastRunSummary}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
