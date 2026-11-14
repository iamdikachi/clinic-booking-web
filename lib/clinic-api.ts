export interface Slot {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
}

export interface SlotsListResponse {
  slots: Slot[];
}

export interface Booking {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled" | string;
  created_at: string;
}

export interface BookingsListResponse {
  bookings: Booking[];
  next_cursor: string | null;
}

export interface CreateBookingInput {
  slot_id: string;
  name: string;
  email: string;
}

export class ClinicApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    options: {
      status: number;
      retryAfterSeconds?: number | null;
      isNetworkError?: boolean;
    },
  ) {
    super(message);
    this.name = "ClinicApiError";
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  return raw.replace(/\/+$/, "");
}

function getApiHeaders(extra?: Record<string, string>): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "";
  return {
    "X-API-Key": apiKey,
    ...extra,
  };
}

async function parseErrorResponse(res: Response): Promise<ClinicApiError> {
  let message = `Request failed with status ${res.status}`;
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      message = data.error.trim();
    }
  } catch {
    // Keep default status message when body is non-JSON.
  }

  const rawRetryAfter = res.headers.get("Retry-After");
  let retryAfterSeconds: number | null = null;
  if (rawRetryAfter) {
    const parsed = Number(rawRetryAfter);
    if (Number.isFinite(parsed) && parsed > 0) {
      retryAfterSeconds = Math.ceil(parsed);
    }
  }

  return new ClinicApiError(message, {
    status: res.status,
    retryAfterSeconds,
  });
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: getApiHeaders(
        init.headers as Record<string, string> | undefined,
      ),
      cache: "no-store",
    });
  } catch {
    throw new ClinicApiError(
      `Unable to reach the clinic scheduling API at ${getApiBaseUrl()}.`,
      { status: 0, isNetworkError: true },
    );
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as T;
}

export async function fetchSlots(provider?: string): Promise<Slot[]> {
  const params = new URLSearchParams();
  if (provider && provider.trim().length > 0) {
    params.set("provider", provider.trim());
  }
  const query = params.toString();
  const data = await requestJson<SlotsListResponse>(
    query ? `/slots?${query}` : "/slots",
  );
  return Array.isArray(data.slots) ? data.slots : [];
}

export async function createBooking(
  payload: CreateBookingInput,
  idempotencyKey: string,
): Promise<Booking> {
  return requestJson<Booking>("/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export async function listBookingsByEmail(
  email: string,
  options?: { limit?: number; cursor?: string | null },
): Promise<BookingsListResponse> {
  const params = new URLSearchParams({ email: email.trim() });
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }
  return requestJson<BookingsListResponse>(`/bookings?${params.toString()}`);
}

export async function fetchBookingById(id: string): Promise<Booking> {
  return requestJson<Booking>(`/bookings/${encodeURIComponent(id.trim())}`);
}

export async function cancelBookingById(id: string): Promise<Booking> {
  return requestJson<Booking>(`/bookings/${encodeURIComponent(id.trim())}`, {
    method: "DELETE",
  });
}

/**
 * Turns slug identifiers like `dr-smith` or `dr_elena_ross` into readable clinician names.
 */
export function formatProviderName(provider: string): string {
  const parts = provider
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return provider;
  }
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0 && lower === "dr") {
        return "Dr.";
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function formatDayKey(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDayHeading(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function formatDateTimeReadable(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getLocalTimeZoneDescription(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzShort = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return tzShort && zone ? `${zone} (${tzShort})` : zone || tzShort || "Local time";
  } catch {
    return "Local time";
  }
}
