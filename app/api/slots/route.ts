import type { NextRequest } from "next/server";
import { proxyClinicApi } from "@/lib/clinic-server";

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider")?.trim();
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  return proxyClinicApi(`/slots${query}`);
}
