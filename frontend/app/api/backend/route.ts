import { NextRequest, NextResponse } from "next/server";

const RAW_BACKEND_BASE =
  process.env.INTERNAL_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

const BACKEND_BASE = RAW_BACKEND_BASE.replace(/\/+$/, "");

async function handler(request: NextRequest) {
  try {
    const rawPath = request.nextUrl.searchParams.get("path");

    if (!rawPath) {
      return NextResponse.json(
        { status: "error", message: "Parâmetro 'path' é obrigatório." },
        { status: 400 }
      );
    }

    const extraParams = new URLSearchParams(request.nextUrl.search);
    extraParams.delete("path");

    const suffix = extraParams.toString();
    const targetUrl = `${BACKEND_BASE}${rawPath}${suffix ? `?${suffix}` : ""}`;

    const headers = new Headers();
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("authorization", authorization);

    const method = request.method.toUpperCase();
    const hasBody = !["GET", "HEAD"].includes(method);

    let body: string | undefined = undefined;
    if (hasBody) {
      const contentType = request.headers.get("content-type");
      if (contentType) headers.set("content-type", contentType);
      body = await request.text();
    }

    console.log("[api/backend] relay", {
      method,
      rawPath,
      targetUrl,
      backendBase: BACKEND_BASE,
      hasAuth: Boolean(authorization),
    });

    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await response.text();

    console.log("[api/backend] upstream response", {
      status: response.status,
      ok: response.ok,
      targetUrl,
      preview: text.slice(0, 300),
    });

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ||
          "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/backend] fatal error", error);

    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha interna no relay /api/backend",
      },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
