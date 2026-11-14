import type { NextRequest } from "next/server";
import { proxyClinicApi } from "@/lib/clinic-server";

export async function GET(request: NextRequest) {
  const params = new URLSearchParams();
  const email = request.nextUrl.searchParams.get("email");
  const limit = request.nextUrl.searchParams.get("limit");
  const cursor = request.nextUrl.searchParams.get("cursor");

  if (email !== null) {
    params.set("email", email);
  }
  if (limit !== null) {
    params.set("limit", limit);
  }
  if (cursor !== null) {
    params.set("cursor", cursor);
  }

  const queryString = params.toString();
  const path = queryString ? `/bookings?${queryString}` : "/bookings";
  return proxyClinicApi(path);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyClinicApi("/bookings", {
    method: "POST",
    body,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
}
