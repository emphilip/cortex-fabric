"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunNowPanel() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = repoUrl.trim();
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      setError("Enter a valid http(s) repository URL.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/proxy/ingestion/git/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo_url: candidate }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(`Run failed (${res.status})`);
      return;
    }
    setRepoUrl("");
    router.refresh();
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: 8,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <input
        type="url"
        name="repo_url"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        required
        style={{
          flex: 1,
          padding: "8px 10px",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 14,
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
        {busy ? "Starting…" : "Run now"}
      </button>
      {error ? (
        <span
          style={{
            alignSelf: "center",
            color: "var(--error)",
            fontSize: 12,
          }}
        >
          {error}
        </span>
      ) : null}
    </form>
  );
}
