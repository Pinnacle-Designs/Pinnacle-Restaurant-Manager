import type { SocialPlatform } from "@prisma/client";

export const SOCIAL_PLATFORMS: Array<{
  value: SocialPlatform;
  label: string;
  color: string;
  bgColor: string;
  charLimit: number;
  profileBaseUrl: string;
}> = [
  {
    value: "FACEBOOK",
    label: "Facebook",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    charLimit: 63206,
    profileBaseUrl: "https://facebook.com/",
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    color: "text-pink-600",
    bgColor: "bg-pink-50 border-pink-200",
    charLimit: 2200,
    profileBaseUrl: "https://instagram.com/",
  },
  {
    value: "TIKTOK",
    label: "TikTok",
    color: "text-slate-900",
    bgColor: "bg-slate-50 border-slate-300",
    charLimit: 2200,
    profileBaseUrl: "https://tiktok.com/@",
  },
  {
    value: "SNAPCHAT",
    label: "Snapchat",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    charLimit: 250,
    profileBaseUrl: "https://snapchat.com/add/",
  },
  {
    value: "X",
    label: "X (Twitter)",
    color: "text-slate-800",
    bgColor: "bg-slate-100 border-slate-300",
    charLimit: 280,
    profileBaseUrl: "https://x.com/",
  },
  {
    value: "YOUTUBE",
    label: "YouTube",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    charLimit: 5000,
    profileBaseUrl: "https://youtube.com/@",
  },
  {
    value: "LINKEDIN",
    label: "LinkedIn",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-300",
    charLimit: 3000,
    profileBaseUrl: "https://linkedin.com/company/",
  },
  {
    value: "PINTEREST",
    label: "Pinterest",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-300",
    charLimit: 500,
    profileBaseUrl: "https://pinterest.com/",
  },
];

export function getPlatformConfig(platform: SocialPlatform) {
  return SOCIAL_PLATFORMS.find((p) => p.value === platform)!;
}

export function getMinCharLimit(platforms: SocialPlatform[]): number {
  if (platforms.length === 0) return 63206;
  return Math.min(...platforms.map((p) => getPlatformConfig(p).charLimit));
}

export interface PublishInput {
  platform: SocialPlatform;
  accountName: string;
  content: string;
  mediaUrl?: string | null;
}

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  errorMessage?: string;
}

/** Publish to a platform. Uses real APIs when env keys are set; otherwise simulates. */
export async function publishToPlatform(input: PublishInput): Promise<PublishResult> {
  const { platform, accountName, content, mediaUrl } = input;
  const hasApiKey = checkPlatformCredentials(platform);

  if (!hasApiKey) {
    await delay(400 + Math.random() * 600);
    void content;
    void mediaUrl;
    const postId = `sim_${platform.toLowerCase()}_${Date.now()}`;
    const config = getPlatformConfig(platform);
    const handle = accountName.replace(/^@/, "");
    return {
      success: true,
      externalPostId: postId,
      externalUrl: `${config.profileBaseUrl}${handle}/posts/${postId.slice(-8)}`,
    };
  }

  try {
    return await publishViaApi(input);
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Publish failed",
    };
  }
}

/** Platforms with a live publish implementation in publishViaApi. */
const LIVE_PUBLISH_PLATFORMS = new Set<SocialPlatform>(["X", "FACEBOOK", "INSTAGRAM"]);

function checkPlatformCredentials(platform: SocialPlatform): boolean {
  if (!LIVE_PUBLISH_PLATFORMS.has(platform)) return false;

  const envMap: Partial<Record<SocialPlatform, string | undefined>> = {
    FACEBOOK: process.env.META_ACCESS_TOKEN,
    INSTAGRAM: process.env.META_ACCESS_TOKEN,
    X: process.env.X_BEARER_TOKEN,
  };
  return Boolean(envMap[platform]);
}

async function publishViaApi(input: PublishInput): Promise<PublishResult> {
  const { platform } = input;

  switch (platform) {
    case "X": {
      const token = process.env.X_BEARER_TOKEN!;
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: input.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.title || "X API error");
      return {
        success: true,
        externalPostId: data.data?.id,
        externalUrl: `https://x.com/i/web/status/${data.data?.id}`,
      };
    }
    case "FACEBOOK":
    case "INSTAGRAM": {
      const token = process.env.META_ACCESS_TOKEN!;
      const pageId = process.env.META_PAGE_ID;
      if (!pageId) throw new Error("META_PAGE_ID required for Meta platforms");
      const endpoint =
        platform === "INSTAGRAM"
          ? `https://graph.facebook.com/v19.0/${pageId}/media`
          : `https://graph.facebook.com/v19.0/${pageId}/feed`;
      const body: Record<string, string> =
        platform === "INSTAGRAM" && input.mediaUrl
          ? { image_url: input.mediaUrl, caption: input.content, access_token: token }
          : { message: input.content, access_token: token };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Meta API error");
      return {
        success: true,
        externalPostId: data.id,
        externalUrl: `https://facebook.com/${data.id}`,
      };
    }
    default:
      throw new Error(`Live API not configured for ${platform}. Add credentials to .env`);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const POST_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SCHEDULED: "bg-blue-100 text-blue-800",
  PUBLISHING: "bg-amber-100 text-amber-800",
  PUBLISHED: "bg-green-100 text-green-800",
  PARTIAL: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
};

export const PUBLISH_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PUBLISHING: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};
