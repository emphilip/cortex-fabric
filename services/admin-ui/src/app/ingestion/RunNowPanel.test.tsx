import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunNowPanel } from "./RunNowPanel";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("RunNowPanel", () => {
  it("rejects an invalid repository URL without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RunNowPanel />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "not-a-url" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Run now" }).closest("form")!);

    expect(await screen.findByText("Enter a valid http(s) repository URL.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits a valid repository URL and refreshes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<RunNowPanel />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/example/repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/proxy/ingestion/git/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repo_url: "https://github.com/example/repo" }),
      }),
    );
  });
});
