import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { analyzeDamagePhoto } from "@/lib/ai/analyze-damage";
import { submitCreditMemoRequest } from "@/lib/purchasing/credit-memo";

export async function POST(request: NextRequest) {
  const { user, error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const vendor = String(formData.get("vendor") || "").trim();
      const amount = parseFloat(String(formData.get("amount") || "0"));
      const reason = String(formData.get("reason") || "").trim();
      const category = String(formData.get("category") || "DAMAGED").trim();
      const invoiceId = (formData.get("invoiceId") as string) || null;
      const repEmail = (formData.get("repEmail") as string) || null;

      let photoUrl: string | null = null;
      let scanVendor = vendor;
      let scanReason = reason;
      let scanAmount = amount;
      let scanCategory = category;

      if (file) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ext = file.name.split(".").pop() || "jpg";
        const filename = `${uuidv4()}.${ext}`;
        const uploadsDir = join(process.cwd(), "public", "uploads");
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(join(uploadsDir, filename), buffer);
        photoUrl = `/uploads/${filename}`;

        const base64 = buffer.toString("base64");
        const analysis = await analyzeDamagePhoto(base64);
        if (!scanVendor && analysis.vendor) scanVendor = analysis.vendor;
        if (!scanReason) scanReason = analysis.reason;
        if (!Number.isFinite(scanAmount) || scanAmount <= 0) scanAmount = analysis.estimatedAmount;
        if (!category || category === "DAMAGED") scanCategory = analysis.category;
      }

      if (!scanVendor || !scanReason || !Number.isFinite(scanAmount) || scanAmount <= 0) {
        return NextResponse.json(
          { error: "Vendor, amount, and reason required (photo scan can pre-fill these)" },
          { status: 400 }
        );
      }

      const result = await submitCreditMemoRequest(locationId, {
        vendor: scanVendor,
        amount: scanAmount,
        reason: scanReason,
        category: scanCategory as "DAMAGED",
        invoiceId,
        photoUrl,
        repEmail,
        reportedBy: user?.name ?? user?.email ?? null,
        items: file
          ? undefined
          : undefined,
      });

      return NextResponse.json({
        credit: result.credit,
        email: result.email,
        accountingLocked: result.accountingLocked,
        repEmail: result.repEmail,
      });
    }

    const body = await request.json();
    const vendor = String(body.vendor || "").trim();
    const amount = parseFloat(body.amount);
    const reason = String(body.reason || "").trim();

    if (!vendor || !Number.isFinite(amount) || amount <= 0 || !reason) {
      return NextResponse.json({ error: "Vendor, amount, and reason required" }, { status: 400 });
    }

    const result = await submitCreditMemoRequest(locationId, {
      vendor,
      amount,
      reason,
      category: body.category ?? "DAMAGED",
      invoiceId: body.invoiceId ?? null,
      photoUrl: body.photoUrl ?? null,
      repEmail: body.repEmail ?? null,
      reportedBy: user?.name ?? user?.email ?? null,
      items: body.items,
    });

    return NextResponse.json({
      credit: result.credit,
      email: result.email,
      accountingLocked: result.accountingLocked,
      repEmail: result.repEmail,
    });
  } catch (err) {
    console.error("Credit memo request error:", err);
    return NextResponse.json({ error: "Failed to submit credit request" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const { getCreditMemoSummary } = await import("@/lib/purchasing/credit-memo");
  const summary = await getCreditMemoSummary(locationId);
  return NextResponse.json(summary);
}
