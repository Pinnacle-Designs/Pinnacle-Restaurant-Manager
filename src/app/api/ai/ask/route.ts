import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { answerManagerQuestion } from "@/lib/ai/answer-question";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "view_insights");
  if (error) return error;

  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const result = await answerManagerQuestion(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI ask error:", err);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
