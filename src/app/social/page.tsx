import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { hasPermissionInList } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SocialClient } from "@/components/social/SocialClient";

export default async function SocialPage() {
  const user = await getEnrichedSessionUser();
  if (!user || !hasPermissionInList(user.permissions, "manage_social")) {
    redirect("/dashboard");
  }

  const locationId = await getLocationId();

  const [accounts, posts, website] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { locationId },
      orderBy: { platform: "asc" },
    }),
    prisma.socialPost.findMany({
      where: { locationId },
      include: {
        targets: { include: { account: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.websiteConnection.findUnique({ where: { locationId } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Social Media"
        description="Manage connected accounts, website traffic, and publish posts across platforms"
      />
      <SocialClient
        initialAccounts={accounts.map((a) => ({
          ...a,
          lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
        }))}
        initialPosts={posts.map((p) => ({
          ...p,
          scheduledFor: p.scheduledFor?.toISOString() ?? null,
          publishedAt: p.publishedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          targets: p.targets.map((t) => ({
            ...t,
            publishedAt: t.publishedAt?.toISOString() ?? null,
            account: {
              ...t.account,
              lastSyncedAt: t.account.lastSyncedAt?.toISOString() ?? null,
            },
          })),
        }))}
        initialWebsite={
          website
            ? {
                ...website,
                lastSyncedAt: website.lastSyncedAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
