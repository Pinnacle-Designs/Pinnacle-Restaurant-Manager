"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Share2,
  Link2,
  Unlink,
  Send,
  Clock,
  Trash2,
  ExternalLink,
  RefreshCw,
  Users,
  FileText,
  Calendar,
  Globe,
  BarChart3,
} from "lucide-react";
import { Button, Badge, EmptyState, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { Input, Textarea, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import {
  SOCIAL_PLATFORMS,
  getPlatformConfig,
  getMinCharLimit,
  POST_STATUS_COLORS,
  PUBLISH_STATUS_COLORS,
} from "@/lib/social";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { parseTopPages, parseReferrers } from "@/lib/website-analytics";
import type { SocialPlatform } from "@prisma/client";

interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  profileUrl: string | null;
  followers: number;
  connected: boolean;
  lastSyncedAt: string | null;
}

interface PostTarget {
  id: string;
  status: string;
  externalUrl: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  account: SocialAccount;
}

interface SocialPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  targets: PostTarget[];
}

interface WebsiteConnection {
  id: string;
  url: string;
  connected: boolean;
  visitors30d: number;
  pageViews30d: number;
  sessions30d: number;
  bounceRate: number;
  avgSessionSec: number;
  topPages: string | null;
  referrers: string | null;
  lastSyncedAt: string | null;
}

type Tab = "compose" | "accounts" | "traffic" | "posts";

export function SocialClient({
  initialAccounts,
  initialPosts,
  initialWebsite,
}: {
  initialAccounts: SocialAccount[];
  initialPosts: SocialPost[];
  initialWebsite: WebsiteConnection | null;
}) {
  const [tab, setTab] = useState<Tab>("compose");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [posts, setPosts] = useState(initialPosts);
  const [website, setWebsite] = useState<WebsiteConnection | null>(initialWebsite);

  const [connectModal, setConnectModal] = useState<SocialPlatform | null>(null);
  const [websiteModalOpen, setWebsiteModalOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [connectName, setConnectName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const connectedAccounts = accounts.filter((a) => a.connected);
  const websiteConnected = website?.connected ?? false;
  const totalFollowers = connectedAccounts.reduce((s, a) => s + a.followers, 0);
  const scheduledCount = posts.filter((p) => p.status === "SCHEDULED").length;
  const publishedCount = posts.filter((p) =>
    ["PUBLISHED", "PARTIAL"].includes(p.status)
  ).length;

  const selectedPlatforms = connectedAccounts
    .filter((a) => selectedAccounts.includes(a.id))
    .map((a) => a.platform);
  const charLimit = getMinCharLimit(selectedPlatforms);

  const tabs: { id: Tab; label: string; icon: typeof Share2 }[] = [
    { id: "compose", label: "Compose", icon: Send },
    { id: "accounts", label: "Accounts", icon: Link2 },
    { id: "traffic", label: "Website Traffic", icon: BarChart3 },
    { id: "posts", label: "Posts", icon: FileText },
  ];

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllAccounts = () => {
    if (selectedAccounts.length === connectedAccounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(connectedAccounts.map((a) => a.id));
    }
  };

  const handleConnect = async () => {
    if (!connectModal || !connectName.trim()) return;
    setConnecting(true);
    try {
      const account = await apiPost<SocialAccount>("/api/social/accounts", {
        platform: connectModal,
        accountName: connectName.trim(),
      });
      setAccounts((prev) => {
        const idx = prev.findIndex((a) => a.platform === account.platform);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = account;
          return next;
        }
        return [...prev, account];
      });
      setConnectModal(null);
      setConnectName("");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (account: SocialAccount) => {
    await apiDelete(`/api/social/accounts/${account.id}`);
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, connected: false } : a))
    );
    setSelectedAccounts((prev) => prev.filter((id) => id !== account.id));
  };

  const handleConnectWebsite = async () => {
    if (!websiteUrl.trim()) return;
    setConnecting(true);
    try {
      const connected = await apiPost<WebsiteConnection>("/api/social/website", {
        url: websiteUrl.trim(),
      });
      setWebsite(connected);
      setWebsiteModalOpen(false);
      setWebsiteUrl("");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectWebsite = async () => {
    await apiDelete("/api/social/website");
    setWebsite((prev) => (prev ? { ...prev, connected: false } : null));
  };

  const handleSyncWebsite = async () => {
    if (!website?.connected) return;
    setConnecting(true);
    try {
      const synced = await apiPost<WebsiteConnection>("/api/social/website/sync", {});
      setWebsite(synced);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (account: SocialAccount) => {
    const updated = await apiPatch<SocialAccount>(`/api/social/accounts/${account.id}`, {
      followers: account.followers + Math.floor(Math.random() * 50),
      connected: true,
    });
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const submitPost = async (publishNow: boolean) => {
    if (!content.trim()) {
      setComposeError("Write something for your post");
      return;
    }
    if (selectedAccounts.length === 0) {
      setComposeError("Select at least one platform");
      return;
    }
    if (content.length > charLimit) {
      setComposeError(`Content exceeds ${charLimit} character limit for selected platforms`);
      return;
    }

    setPublishing(true);
    setComposeError(null);
    try {
      const post = await apiPost<SocialPost>("/api/social/posts", {
        content,
        mediaUrl: mediaUrl || null,
        accountIds: selectedAccounts,
        scheduledFor: !publishNow && scheduledFor ? scheduledFor : null,
        publishNow,
      });

      if (publishNow) {
        const published = await apiPost<SocialPost>(
          `/api/social/posts/${post.id}/publish`,
          {}
        );
        setPosts((prev) => [published, ...prev]);
      } else {
        setPosts((prev) => [post, ...prev]);
      }

      setContent("");
      setMediaUrl("");
      setScheduledFor("");
      setTab("posts");
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setPublishing(false);
    }
  };

  const publishExisting = async (postId: string) => {
    setPublishing(true);
    try {
      const published = await apiPost<SocialPost>(
        `/api/social/posts/${postId}/publish`,
        {}
      );
      setPosts((prev) => prev.map((p) => (p.id === postId ? published : p)));
    } finally {
      setPublishing(false);
    }
  };

  const deletePost = async (postId: string) => {
    await apiDelete(`/api/social/posts/${postId}`);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const accountForPlatform = (platform: SocialPlatform) =>
    accounts.find((a) => a.platform === platform);

  return (
    <div>
      <PageSectionShell pageId="social-overview">
        <PageSection id="social-stats" title="Overview" defaultOpen>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Connected Platforms"
              value={connectedAccounts.length}
              subtext={`of ${SOCIAL_PLATFORMS.length} available`}
            />
            <StatCard
              label="Total Followers"
              value={totalFollowers.toLocaleString()}
              subtext="Across all accounts"
            />
            <StatCard
              label="Published Posts"
              value={publishedCount}
              subtext={`${scheduledCount} scheduled`}
            />
            {websiteConnected && website ? (
              <StatCard
                label="Website Visitors"
                value={website.visitors30d.toLocaleString()}
                subtext="Last 30 days"
              />
            ) : (
              <StatCard
                label="Website"
                value="Not connected"
                subtext="Connect to track traffic"
              />
            )}
          </div>
        </PageSection>
      </PageSectionShell>

      <ScrollableTabs className="mt-6 gap-1 rounded-lg border bg-white p-1" menuLabel="Social">
        {tabs.map(({ id, label, icon: Icon }) => (
          <TabPill
            key={id}
            id={id}
            active={tab === id}
            onClick={() => setTab(id)}
            className={cn(tab === id && "bg-orange-500 text-white hover:bg-orange-500")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </TabPill>
        ))}
      </ScrollableTabs>

      {tab === "accounts" && (
        <PageSectionShell pageId="social-accounts">
          <PageSection
            id="social-website"
            title="Restaurant website"
            description="Connect your website to track visitors alongside social performance."
            defaultOpen
          >
          <div className="card border-2 border-indigo-200 bg-indigo-50">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-indigo-900">Restaurant Website</h3>
                  {websiteConnected ? (
                    <Badge className="bg-green-100 text-green-700">Tracking</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500">Not connected</Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Connect your website to track visitors, page views, and referral sources alongside
                  social performance.
                </p>
              </div>
              {websiteConnected && website ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={handleSyncWebsite}>
                    <RefreshCw className="h-3 w-3" />
                    Sync traffic
                  </Button>
                  <a
                    href={website.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-indigo-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Visit site
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDisconnectWebsite}
                    className="text-red-600"
                  >
                    <Unlink className="h-3 w-3" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setWebsiteModalOpen(true)}>
                  <Link2 className="h-3 w-3" />
                  Connect website
                </Button>
              )}
            </div>

            {websiteConnected && website && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs text-slate-500">Visitors (30d)</p>
                  <p className="text-lg font-semibold">{website.visitors30d.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs text-slate-500">Page views (30d)</p>
                  <p className="text-lg font-semibold">{website.pageViews30d.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs text-slate-500">Bounce rate</p>
                  <p className="text-lg font-semibold">{website.bounceRate.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs text-slate-500">Avg. session</p>
                  <p className="text-lg font-semibold">
                    {Math.floor(website.avgSessionSec / 60)}m {website.avgSessionSec % 60}s
                  </p>
                </div>
              </div>
            )}
          </div>
          </PageSection>

          <PageSection
            id="social-platforms"
            title="Social accounts"
            description="Connect platforms to publish posts."
          >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            const account = accountForPlatform(platform.value);
            const isConnected = account?.connected;
            return (
              <div
                key={platform.value}
                className={cn("card border-2 transition-colors", platform.bgColor)}
              >
                <div className="flex items-center justify-between">
                  <h3 className={cn("font-semibold", platform.color)}>{platform.label}</h3>
                  {isConnected ? (
                    <Badge className="bg-green-100 text-green-700">Connected</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500">Not connected</Badge>
                  )}
                </div>

                {isConnected && account ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-slate-800">{account.accountName}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3 w-3" />
                      {account.followers.toLocaleString()} followers
                    </p>
                    {account.lastSyncedAt && (
                      <p className="text-xs text-slate-400">
                        Synced {formatDate(account.lastSyncedAt)}
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSync(account)}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Sync
                      </Button>
                      {account.profileUrl && (
                        <a
                          href={account.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-white"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDisconnect(account)}
                        className="text-red-600"
                      >
                        <Unlink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500">
                      Connect your {platform.label} account to publish posts.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => {
                        setConnectModal(platform.value);
                        setConnectName("");
                      }}
                    >
                      <Link2 className="h-3 w-3" />
                      Connect
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          </div>
          </PageSection>
        </PageSectionShell>
      )}

      {tab === "traffic" && (
        <PageSectionShell pageId="social-traffic">
          {!websiteConnected || !website ? (
            <PageSection id="social-traffic-empty" title="Website traffic" defaultOpen>
            <EmptyState
              icon={<Globe className="h-12 w-12" />}
              title="Connect your website"
              description="Add your restaurant website to track visitors, page views, bounce rate, and which channels drive traffic."
              action={
                <Button onClick={() => setWebsiteModalOpen(true)}>
                  <Link2 className="h-4 w-4" />
                  Connect website
                </Button>
              }
            />
            </PageSection>
          ) : (
            <>
              <PageSection
                id="social-traffic-summary"
                title="Website traffic"
                description={website.url}
                defaultOpen
                headerActions={
                  <Button size="sm" variant="secondary" onClick={handleSyncWebsite} disabled={connecting}>
                    <RefreshCw className="h-3 w-3" />
                    {connecting ? "Syncing..." : "Sync traffic"}
                  </Button>
                }
              >
                {website.lastSyncedAt && (
                  <p className="mb-4 text-xs text-slate-400">
                    Last synced {formatDate(website.lastSyncedAt)}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Visitors"
                    value={website.visitors30d.toLocaleString()}
                    subtext="Last 30 days"
                  />
                  <StatCard
                    label="Page views"
                    value={website.pageViews30d.toLocaleString()}
                    subtext={`${website.sessions30d.toLocaleString()} sessions`}
                  />
                  <StatCard
                    label="Bounce rate"
                    value={`${website.bounceRate.toFixed(1)}%`}
                    subtext="Single-page sessions"
                  />
                  <StatCard
                    label="Avg. session"
                    value={`${Math.floor(website.avgSessionSec / 60)}m ${website.avgSessionSec % 60}s`}
                    subtext="Time on site"
                  />
                </div>
              </PageSection>

              <PageSection id="social-traffic-pages" title="Top pages">
                <ul className="space-y-3">
                  {parseTopPages(website.topPages).map((page) => (
                    <li key={page.path} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-slate-700">{page.path}</span>
                      <span className="text-slate-500">{page.views.toLocaleString()} views</span>
                    </li>
                  ))}
                </ul>
              </PageSection>

              <PageSection id="social-traffic-sources" title="Traffic sources">
                <ul className="space-y-3">
                  {parseReferrers(website.referrers).map((ref) => (
                    <li key={ref.source}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{ref.source}</span>
                        <span className="text-slate-500">{ref.pct}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-indigo-500"
                          style={{ width: `${ref.pct}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </PageSection>
            </>
          )}
        </PageSectionShell>
      )}

      {tab === "compose" && (
        <PageSectionShell pageId="social-compose">
          <div className="grid gap-6 lg:grid-cols-3">
          <PageSection id="social-compose-form" title="Create post" defaultOpen className="lg:col-span-2">
          <div className="space-y-4">
            <FormField label={`Content${charLimit < 63206 ? ` (max ${charLimit} chars)` : ""}`}>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's happening at your restaurant today?"
                rows={5}
              />
              <p
                className={cn(
                  "mt-1 text-right text-xs",
                  content.length > charLimit ? "text-red-600" : "text-slate-400"
                )}
              >
                {content.length}/{charLimit}
              </p>
            </FormField>

            <FormField label="Media URL (optional)">
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
            </FormField>

            {mediaUrl && (
              <div className="relative h-40 w-full overflow-hidden rounded-lg border">
                <Image
                  src={mediaUrl}
                  alt="Post preview"
                  fill
                  className="object-cover"
                  unoptimized
                  onError={() => setMediaUrl("")}
                />
              </div>
            )}

            <FormField label="Schedule for later (optional)">
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </FormField>

            {composeError && <p className="text-sm text-red-600">{composeError}</p>}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => submitPost(true)}
                disabled={publishing || connectedAccounts.length === 0}
              >
                <Send className="h-4 w-4" />
                {publishing ? "Publishing..." : "Publish Now"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => submitPost(false)}
                disabled={publishing || connectedAccounts.length === 0}
              >
                <Clock className="h-4 w-4" />
                {scheduledFor ? "Schedule Post" : "Save Draft"}
              </Button>
            </div>
          </div>
          </PageSection>

          <PageSection id="social-compose-platforms" title="Platforms">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              {connectedAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={selectAllAccounts}
                  className="text-xs text-orange-600 hover:underline"
                >
                  {selectedAccounts.length === connectedAccounts.length
                    ? "Deselect all"
                    : "Select all"}
                </button>
              )}
            </div>
            {connectedAccounts.length === 0 ? (
              <EmptyState
                icon={<Link2 className="h-12 w-12" />}
                title="No accounts connected"
                description="Connect your social media accounts first to publish posts."
                action={
                  <Button size="sm" onClick={() => setTab("accounts")}>
                    Connect Accounts
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {connectedAccounts.map((account) => {
                  const config = getPlatformConfig(account.platform);
                  const selected = selectedAccounts.includes(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-orange-400 bg-orange-50"
                          : "border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                          config.bgColor,
                          config.color
                        )}
                      >
                        {config.label[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{config.label}</p>
                        <p className="truncate text-xs text-slate-500">{account.accountName}</p>
                      </div>
                      <div
                        className={cn(
                          "h-4 w-4 rounded border-2",
                          selected ? "border-orange-500 bg-orange-500" : "border-slate-300"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </PageSection>
          </div>
        </PageSectionShell>
      )}

      {tab === "posts" && (
        <PageSectionShell pageId="social-posts">
          <PageSection id="social-posts-list" title="Posts" defaultOpen>
          <div className="space-y-4">
          {posts.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No posts yet"
              description="Compose your first post and push it to your social platforms."
              action={
                <Button size="sm" onClick={() => setTab("compose")}>
                  Create Post
                </Button>
              }
            />
          ) : (
            posts.map((post) => (
              <div key={post.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={POST_STATUS_COLORS[post.status] ?? ""}>
                        {post.status}
                      </Badge>
                      {post.scheduledFor && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Calendar className="h-3 w-3" />
                          Scheduled {formatDate(post.scheduledFor)}
                        </span>
                      )}
                      {post.publishedAt && (
                        <span className="text-xs text-slate-500">
                          Published {formatDate(post.publishedAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {post.content}
                    </p>
                    {post.mediaUrl && (
                      <p className="mt-1 truncate text-xs text-slate-400">{post.mediaUrl}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {["DRAFT", "SCHEDULED", "FAILED", "PARTIAL"].includes(post.status) && (
                      <Button
                        size="sm"
                        onClick={() => publishExisting(post.id)}
                        disabled={publishing}
                      >
                        <Send className="h-3 w-3" />
                        Publish
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => deletePost(post.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {post.targets.map((target) => {
                    const config = getPlatformConfig(target.account.platform);
                    return (
                      <div
                        key={target.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs",
                          config.bgColor
                        )}
                      >
                        <span className={cn("font-medium", config.color)}>
                          {config.label}
                        </span>
                        <Badge
                          className={cn(
                            "text-[10px]",
                            PUBLISH_STATUS_COLORS[target.status] ?? ""
                          )}
                        >
                          {target.status}
                        </Badge>
                        {target.externalUrl && (
                          <a
                            href={target.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-orange-600"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {target.errorMessage && (
                          <span className="text-red-500" title={target.errorMessage}>
                            !
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          </div>
          </PageSection>
        </PageSectionShell>
      )}

      <Modal
        open={connectModal !== null}
        onClose={() => setConnectModal(null)}
        title={connectModal ? `Connect ${getPlatformConfig(connectModal).label}` : ""}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter your account handle or page name. In production, this would open an OAuth
            connection flow with the platform.
          </p>
          <FormField label="Account name / handle">
            <Input
              value={connectName}
              onChange={(e) => setConnectName(e.target.value)}
              placeholder="@yourrestaurant"
              autoFocus
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConnectModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={connecting || !connectName.trim()}>
              {connecting ? "Connecting..." : "Connect Account"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={websiteModalOpen}
        onClose={() => setWebsiteModalOpen(false)}
        title="Connect your website"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter your restaurant website URL. We&apos;ll track visitor traffic, page views, and
            referral sources. In production, this connects to your analytics provider (e.g. Google
            Analytics).
          </p>
          <FormField label="Website URL">
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourrestaurant.com"
              autoFocus
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWebsiteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectWebsite} disabled={connecting || !websiteUrl.trim()}>
              {connecting ? "Connecting..." : "Connect & track traffic"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
