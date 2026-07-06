import { NextRequest } from "next/server";
import { buildEmbedLaunchResponse } from "@/lib/embed-launch";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  return buildEmbedLaunchResponse(request, path);
}
