"use client";

import { useState } from "react";
import type { VectorSearchHit, VectorSearchResponse } from "@opencg/shared";
import { VectorHit } from "@/components/VectorHit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

async function runSearch(query: string, topK: number): Promise<VectorSearchResponse | null> {
  const res = await fetch("/api/proxy/search/vector", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) return null;
  return (await res.json()) as VectorSearchResponse;
}

export function VectorExplorer() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<VectorSearchResponse | null>(null);

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setBusy(true);
    setError(null);
    const r = await runSearch(searchQuery.trim(), topK);
    setBusy(false);
    if (!r) {
      setError("Search failed — see pipeline logs.");
      setResponse(null);
      return;
    }
    setResponse(r);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch(query);
  };

  const onShowNeighbours = async (hit: VectorSearchHit) => {
    const neighbourQuery = hit.snippet || hit.title || hit.entity_id;
    setQuery(neighbourQuery);
    await executeSearch(neighbourQuery);
  };

  return (
    <div>
      <form onSubmit={submit} className="mb-3 flex items-center gap-2">
        <Input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalogue…"
          className="flex-1"
        />
        <Input
          type="number"
          name="top_k"
          value={topK}
          min={1}
          max={100}
          onChange={(e) => setTopK(Number(e.target.value))}
          className="w-20"
        />
        <Button type="submit" disabled={busy} className={busy ? "cursor-wait" : ""}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {error ? (
        <div className="p-3 text-red-600 dark:text-red-400">{error}</div>
      ) : null}

      {response ? (
        <>
          <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
            <span>
              {response.hits.length} hit{response.hits.length === 1 ? "" : "s"}
            </span>
            <span>
              model: <code>{response.model}</code>
            </span>
            <span>
              provider: <code>{response.provider}</code>
            </span>
            <span>tokens_in: {response.tokens_in}</span>
          </div>
          <Card className="overflow-hidden">
            {response.hits.length === 0 ? (
              <div className="p-6 text-muted-foreground">No hits.</div>
            ) : (
              response.hits.map((h, i) => (
                <VectorHit
                  key={h.entity_id}
                  hit={h}
                  rank={i + 1}
                  onShowNeighbours={onShowNeighbours}
                />
              ))
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
