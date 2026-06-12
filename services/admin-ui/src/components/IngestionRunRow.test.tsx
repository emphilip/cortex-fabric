import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IngestionRunRow } from "./IngestionRunRow";

const base = {
  run_id: "r1",
  connector: "git",
  repo: "https://github.com/x/y",
  started_at: new Date("2026-06-11T12:00:00Z").toISOString(),
  status: "running" as const,
};

describe("IngestionRunRow", () => {
  it("renders the running status", () => {
    render(<IngestionRunRow run={base} />);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/x/y")).toBeInTheDocument();
  });

  it("renders parents and chunks counts on success", () => {
    render(
      <IngestionRunRow
        run={{
          ...base,
          status: "succeeded",
          finished_at: new Date("2026-06-11T12:01:30Z").toISOString(),
          parents: 333,
          chunks: 2168,
        }}
      />,
    );
    expect(screen.getByText("333 files")).toBeInTheDocument();
    expect(screen.getByText("2168 chunks")).toBeInTheDocument();
  });

  it("falls back to em-dashes when finished_at/parents are missing", () => {
    render(<IngestionRunRow run={base} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("formats sub-second durations", () => {
    render(
      <IngestionRunRow
        run={{
          ...base,
          status: "succeeded",
          finished_at: new Date("2026-06-11T12:00:00.500Z").toISOString(),
        }}
      />,
    );
    expect(screen.getByText("500 ms")).toBeInTheDocument();
  });

  it("renders the failure error", () => {
    render(
      <IngestionRunRow
        run={{ ...base, status: "failed", error: "repository unavailable" }}
      />,
    );
    expect(screen.getByText("repository unavailable")).toBeInTheDocument();
  });
});
