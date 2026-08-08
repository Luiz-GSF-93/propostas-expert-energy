import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = process.env.INTERNAL_API_BASE || "http://127.0.0.1:4000";

async function handler(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("path");

  if (!rawPath) {
    return NextResponse.json(
      { status: "error", message: "Parâmetro 'path' é obrigatório." },
      { status: 400 }
    );
  }

  const targetUrl = `${BACKEND_BASE}${rawPath}`;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");

  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);

  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.text() : undefined;

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    cache: "no-store",
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
