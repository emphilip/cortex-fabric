"use client";

import { useState } from "react";
import type { VectorSearchHit, VectorSearchResponse } from "@hive-mind/shared";
import { VectorHit } from "@/components/VectorHit";

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
      <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          name="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalogue…"
          style={{
            flex: 1,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 14,
          }}
        />
        <input
          type="number"
          name="top_k"
          value={topK}
          min={1}
          max={100}
          onChange={(e) => setTopK(Number(e.target.value))}
          style={{
            width: 80,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 4,
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? (
        <div style={{ color: "var(--error)", padding: 12 }}>{error}</div>
      ) : null}

      {response ? (
        <>
          <div
            style={{
              color: "var(--muted)",
              fontSize: 12,
              marginBottom: 8,
              display: "flex",
              gap: 16,
            }}
          >
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
          <div style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
            {response.hits.length === 0 ? (
              <div style={{ padding: 24, color: "var(--muted)" }}>No hits.</div>
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
          </div>
        </>
      ) : null}
    </div>
  );
}
