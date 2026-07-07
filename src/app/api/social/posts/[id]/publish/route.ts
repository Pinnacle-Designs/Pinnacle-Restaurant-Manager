import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { publishToPlatform } from "@/lib/social";
import type { SocialPostStatus } from "@prisma/client";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_social");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const post = await prisma.socialPost.findFirst({
    where: tenantWhere(id, locationId),
    include: {
      targets: { include: { account: true } },
    },
  });

  if (!post) {
    return tenantNotFoundResponse("Post not found");
  }

  await prisma.socialPost.update({
    where: tenantWhere(id, locationId),
    data: { status: "PUBLISHING" },
  });

  let successCount = 0;
  let failCount = 0;

  for (const target of post.targets) {
    if (!target.account.connected) continue;

    await prisma.socialPostTarget.update({
      where: { id: target.id },
      data: { status: "PUBLISHING" },
    });

    const result = await publishToPlatform({
      platform: target.account.platform,
      accountName: target.account.accountName,
      content: post.content,
      mediaUrl: post.mediaUrl,
    });

    if (result.success) {
      successCount++;
      await prisma.socialPostTarget.update({
        where: { id: target.id },
        data: {
          status: "PUBLISHED",
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });
    } else {
      failCount++;
      await prisma.socialPostTarget.update({
        where: { id: target.id },
        data: {
          status: "FAILED",
          errorMessage: result.errorMessage || "Unknown error",
        },
      });
    }
  }

  let finalStatus: SocialPostStatus = "PUBLISHED";
  if (successCount === 0) finalStatus = "FAILED";
  else if (failCount > 0) finalStatus = "PARTIAL";

  const updated = await prisma.socialPost.update({
    where: tenantWhere(id, locationId),
    data: {
      status: finalStatus,
      publishedAt: successCount > 0 ? new Date() : null,
    },
    include: {
      targets: { include: { account: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId: post.locationId,
      action: "PUBLISH",
      entity: "socialPost",
      entityId: post.id,
      details: `Published to ${successCount}/${post.targets.length} platform(s)`,
    },
  });

  return NextResponse.json({
    ...updated,
    scheduledFor: updated.scheduledFor?.toISOString() ?? null,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    targets: updated.targets.map((t) => ({
      ...t,
      publishedAt: t.publishedAt?.toISOString() ?? null,
    })),
  });
}
