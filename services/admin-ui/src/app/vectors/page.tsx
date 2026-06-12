import { VectorExplorer } from "./VectorExplorer";
import { getReadyz } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function VectorsPage() {
  // Server-side fetch the readyz so we can show the active embedding model
  // info in the header before any client-side request fires.
  const readyz = await getReadyz();
  return (
    <section>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Vector search</h1>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          tenant: {readyz?.tenant ?? "?"}
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          model: <code>{readyz?.embedding_model ?? "unknown"}</code>
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          dimensions: {readyz?.vector_size ?? "?"}
        </span>
      </header>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Search the embedded catalogue. Every request reuses the pipeline's
        embeddings client; vector search is admin-only and does not write an
        audit row.
      </p>
      <VectorExplorer />
    </section>
  );
}
