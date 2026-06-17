import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("renders nav links in the configured order with Graph second", () => {
    render(<Sidebar />);
    const labels = screen.getAllByRole("link").map((link) => link.textContent?.trim());
    expect(labels).toEqual(["Overview", "Graph", "Vectors", "Entities", "Queries", "Ingestion"]);
    expect(labels[1]).toBe("Graph");
  });
});
