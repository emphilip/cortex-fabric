import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectorCard } from "./ConnectorCard";

describe("ConnectorCard", () => {
  it("renders a supported connector and last-run summary", () => {
    render(
      <ConnectorCard
        connector={{ name: "git", supported: true }}
        lastRunSummary="succeeded · 12 files"
      />,
    );
    expect(screen.getByText("git")).toBeInTheDocument();
    expect(screen.getByText("supported")).toBeInTheDocument();
    expect(screen.getByText(/12 files/)).toBeInTheDocument();
  });

  it("renders a deferred connector reason", () => {
    render(
      <ConnectorCard
        connector={{
          name: "confluence",
          supported: false,
          reason: "deferred: add-confluence-connector",
        }}
      />,
    );
    expect(screen.getByText("deferred")).toBeInTheDocument();
    expect(screen.getByText(/add-confluence-connector/)).toBeInTheDocument();
  });
});
