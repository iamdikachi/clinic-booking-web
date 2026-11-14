import type { NextRequest } from "next/server";
import { proxyClinicApi } from "@/lib/clinic-server";

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/bookings/[id]">,
) {
  const { id } = await context.params;
  return proxyClinicApi(`/bookings/${encodeURIComponent(id)}`);
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/bookings/[id]">,
) {
  const { id } = await context.params;
  return proxyClinicApi(`/bookings/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
