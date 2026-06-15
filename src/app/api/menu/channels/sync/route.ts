import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { isMenuChannelId } from "@/lib/menu/channels";
import {
  publishMenuToAllEnabledChannels,
  publishMenuToChannel,
} from "@/lib/menu/publish";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json().catch(() => ({}));

  if (body.channel && isMenuChannelId(body.channel)) {
    const result = await publishMenuToChannel(locationId, body.channel);
    return NextResponse.json({ results: [result] });
  }

  const results = await publishMenuToAllEnabledChannels(locationId);
  return NextResponse.json({ results });
}
