import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { answerManagerQuestion } from "@/lib/ai/answer-question";
import { detectCommandIntent } from "@/lib/ai/command-center";
import { getRequestPlan } from "@/lib/plan-api";
import { isRateLimited } from "@/lib/rate-limit";
import {
  canUseAdvancedAI,
  canUseCommandCenter,
  PLAN_BY_ID,
  STARTER_AI_DAILY_LIMIT,
} from "@/lib/plans";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "view_insights");
  if (error) return error;

  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const plan = await getRequestPlan(request);
    const locationId = await getLocationIdFromRequest(request);
    const intent = detectCommandIntent(question);
    const isCommandScan =
      intent !== "general" ||
      /scan|attention|hurting|summary|command center/i.test(question);

    if (isCommandScan && !canUseCommandCenter(plan)) {
      return NextResponse.json(
        {
          error: `Upgrade to ${PLAN_BY_ID.GROWTH.name} for the AI Command Center scan and dashboard commands.`,
          requiredPlan: "GROWTH",
        },
        { status: 403 }
      );
    }

    if (plan === "STARTER") {
      const dayKey = `ai-starter:${locationId}:${new Date().toISOString().slice(0, 10)}`;
      if (await isRateLimited(dayKey, STARTER_AI_DAILY_LIMIT, 86_400_000)) {
        return NextResponse.json(
          {
            error: `Starter includes ${STARTER_AI_DAILY_LIMIT} AI questions per day. Upgrade to Growth for unlimited Command Center access.`,
            requiredPlan: "GROWTH",
          },
          { status: 429 }
        );
      }
    }

    if (!canUseAdvancedAI(plan) && /profit by item|shift|channel|roi|guest experience/i.test(question)) {
      return NextResponse.json(
        {
          error: `Upgrade to ${PLAN_BY_ID.PRO.name} for advanced profitability and marketing AI prompts.`,
          requiredPlan: "PRO",
        },
        { status: 403 }
      );
    }

    const result = await answerManagerQuestion(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI ask error:", err);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
