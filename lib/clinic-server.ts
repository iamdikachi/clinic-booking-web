import { connection, NextResponse } from "next/server";

export type ClinicProxyErrorCode =
  | "api_not_configured"
  | "api_auth_mismatch"
  | "api_timeout"
  | "api_unreachable";

const UPSTREAM_TIMEOUT_MS = 45_000;

interface UpstreamConfig {
  baseUrl: string;
  apiKey: string;
}

function resolveUpstreamConfig(): UpstreamConfig | null {
  const rawUrl =
    process.env.CLINIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");

  const apiKey =
    process.env.CLINIC_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_API_KEY?.trim() ||
    "";

  if (!rawUrl || !apiKey) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return {
    baseUrl: rawUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

export interface ProxyClinicApiOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: string;
  idempotencyKey?: string | null;
}

/**
 * Forwards an App Router BFF request to `clinic_api` using runtime server credentials.
 */
export async function proxyClinicApi(
  path: string,
  options: ProxyClinicApiOptions = {},
): Promise<NextResponse> {
  await connection();

  const config = resolveUpstreamConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "Clinic scheduling server credentials are not configured on the web server.",
        code: "api_not_configured" satisfies ClinicProxyErrorCode,
      },
      { status: 503 },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
    "X-API-Key": config.apiKey,
  });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.idempotencyKey && options.idempotencyKey.trim().length > 0) {
    headers.set("Idempotency-Key", options.idempotencyKey.trim());
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");

    if (isTimeout) {
      return NextResponse.json(
        {
          error:
            "The scheduling server took too long to respond while waking up. Please retry in a moment.",
          code: "api_timeout" satisfies ClinicProxyErrorCode,
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to connect to the clinic scheduling server right now.",
        code: "api_unreachable" satisfies ClinicProxyErrorCode,
      },
      { status: 502 },
    );
  }

  if (upstream.status === 401) {
    return NextResponse.json(
      {
        error:
          "The web server API key was rejected by the clinic scheduling server.",
        code: "api_auth_mismatch" satisfies ClinicProxyErrorCode,
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) {
    responseHeaders.set("Retry-After", retryAfter);
  }

  const rawText = await upstream.text();
  if (!rawText) {
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Clinic scheduling server returned status ${upstream.status}.`,
          code: "api_unreachable" satisfies ClinicProxyErrorCode,
        },
        {
          status: upstream.status >= 500 ? upstream.status : 502,
          headers: responseHeaders,
        },
      );
    }

    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  try {
    const payload = JSON.parse(rawText) as unknown;
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The clinic scheduling server is starting up and returned a non-JSON response. Retry shortly.",
        code: "api_unreachable" satisfies ClinicProxyErrorCode,
      },
      {
        status: upstream.status >= 500 ? upstream.status : 502,
        headers: responseHeaders,
      },
    );
  }
}
