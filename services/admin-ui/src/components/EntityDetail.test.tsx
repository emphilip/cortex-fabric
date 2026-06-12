import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityDetail } from "./EntityDetail";

const base = {
  entity_id: "e1",
  tenant: "default",
  source: "git",
  source_uri: "git://x/y",
  title: "y",
  classification: "internal",
  freshness_state: "fresh",
  updated_at: new Date("2026-06-11T12:00:00Z").toISOString(),
  tombstoned_at: null,
  body: "hello world",
  content_hash: "deadbeef" + "1234".repeat(8),
  metadata: { path: "y" },
  source_revision: "abc",
  parent_entity_id: null,
  created_at: new Date("2026-06-11T12:00:00Z").toISOString(),
  ingested_at: new Date("2026-06-11T12:00:00Z").toISOString(),
  last_verified_at: new Date("2026-06-11T12:00:00Z").toISOString(),
  lineage: { parent: null, children: [] },
  audit_appearances: [],
};

describe("EntityDetail", () => {
  it("renders the core entity fields", () => {
    render(<EntityDetail entity={base} />);
    expect(screen.getByText("y")).toBeInTheDocument();
    expect(screen.getByText("e1")).toBeInTheDocument();
    expect(screen.getByText("internal")).toBeInTheDocument();
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("shows the tombstoned banner when tombstoned_at is set", () => {
    render(<EntityDetail entity={{ ...base, tombstoned_at: new Date().toISOString() }} />);
    expect(screen.getByText(/Tombstoned at/)).toBeInTheDocument();
  });

  it("hides the tombstone action when no callback is provided", () => {
    render(<EntityDetail entity={base} />);
    expect(screen.queryByText("Tombstone")).toBeNull();
  });

  it("fires the tombstone callback", () => {
    const fn = vi.fn();
    render(<EntityDetail entity={base} onTombstone={fn} />);
    fireEvent.click(screen.getByText("Tombstone"));
    expect(fn).toHaveBeenCalled();
  });

  it("renders children links when lineage has children", () => {
    render(
      <EntityDetail
        entity={{
          ...base,
          lineage: {
            parent: null,
            children: [{ entity_id: "c1", title: "chunk 0", source_uri: "git://x#0" }],
          },
        }}
      />,
    );
    const link = screen.getByText("chunk 0");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/entities/c1");
  });

  it("offers a show-full-body toggle for long bodies", () => {
    const longBody = "x".repeat(60_000);
    const onToggle = vi.fn();
    render(
      <EntityDetail
        entity={{ ...base, body: longBody }}
        showFullBody={false}
        onToggleFullBody={onToggle}
      />,
    );
    const button = screen.getByText(/Show full body/);
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders recent audit appearances", () => {
    render(
      <EntityDetail
        entity={{
          ...base,
          audit_appearances: [
            {
              id: 9,
              created_at: new Date("2026-06-11T12:10:00Z").toISOString(),
              correlation_id: "corr-9",
              tool: "retrieve_for_context",
              query: "prompt caching",
              outcome: "ok",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("prompt caching")).toHaveAttribute("href", "/queries/9");
  });
});
