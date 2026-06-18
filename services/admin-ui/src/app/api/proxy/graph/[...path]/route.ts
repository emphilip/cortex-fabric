import { NextRequest, NextResponse } from "next/server";

const PIPELINE_URL =
  process.env.OPENCG__PIPELINE__URL || "http://pipeline:8000";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = `${PIPELINE_URL}/graph/${path.join("/")}${request.nextUrl.search}`;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();
  const response = await fetch(target, {
    method: request.method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body || undefined,
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
