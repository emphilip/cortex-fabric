import type {
  RetrievalRequest,
  RetrievalResponse,
  TraverseRequest,
  TraverseResponse,
} from "@cortex/shared";
import { request as undiciRequest } from "undici";

export class PipelineRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`pipeline ${statusCode}: ${responseBody}`);
  }
}

export class PipelineClient {
  constructor(private readonly baseUrl: string) {}

  async retrieve(req: RetrievalRequest): Promise<RetrievalResponse> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/retrieve`;
    const res = await undiciRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": req.correlation_id },
      body: JSON.stringify(req),
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new PipelineRequestError(res.statusCode, body);
    }
    return (await res.body.json()) as RetrievalResponse;
  }

  async traverse(req: TraverseRequest): Promise<TraverseResponse> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/graph/traverse`);
    url.searchParams.set("concept_id", req.concept_id);
    if (req.types?.length) {
      url.searchParams.set("types", req.types.join(","));
    }
    if (req.depth !== undefined) {
      url.searchParams.set("depth", String(req.depth));
    }
    if (req.limit !== undefined) {
      url.searchParams.set("limit", String(req.limit));
    }
    if (req.include_candidates !== undefined) {
      url.searchParams.set("include_candidates", String(req.include_candidates));
    }
    const res = await undiciRequest(url);
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new PipelineRequestError(res.statusCode, body);
    }
    return (await res.body.json()) as TraverseResponse;
  }

  async health(): Promise<boolean> {
    try {
      const res = await undiciRequest(`${this.baseUrl.replace(/\/$/, "")}/healthz`);
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }
}
