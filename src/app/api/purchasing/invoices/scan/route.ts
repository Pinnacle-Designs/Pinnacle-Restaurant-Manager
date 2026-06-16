import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { analyzeInvoice } from "@/lib/ai/analyze-invoice";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { processDigitizedInvoice } from "@/lib/purchasing/invoice-digitization";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const invoice = await analyzeInvoice(base64);

    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("Invoice scan error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const vendor = formData.get("vendor") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const invoiceDate = formData.get("invoiceDate") as string;
    const invoiceNumber = formData.get("invoiceNumber") as string;
    const poId = (formData.get("poId") as string) || null;
    const receiptId = (formData.get("receiptId") as string) || null;
    const linesJson = formData.get("lines") as string;
    const lines = linesJson ? JSON.parse(linesJson) : [];

    let imageUrl: string | null = null;
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
      const uploadsDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, filename), buffer);
      imageUrl = `/uploads/${filename}`;
    }

    const saved = await prisma.vendorInvoice.create({
      data: {
        locationId,
        vendor,
        amount,
        category: "Food & Supplies",
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        invoiceNumber: invoiceNumber || null,
        imageUrl,
        poId,
        receiptId,
        lines: {
          create: lines.map(
            (l: {
              description: string;
              qty: number;
              unit: string;
              unitPrice: number;
              lineTotal: number;
              sku?: string;
              inventoryItemId?: string;
              catchWeightBilled?: number;
              catchWeightUnit?: string;
            }) => ({
              description: l.description,
              qty: l.qty,
              unit: l.unit,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              sku: l.sku ?? null,
              inventoryItemId: l.inventoryItemId ?? null,
              catchWeightBilled: l.catchWeightBilled ?? null,
              catchWeightUnit: l.catchWeightUnit ?? null,
            })
          ),
        },
      },
      include: { lines: true },
    });

    const result = await processDigitizedInvoice(locationId, {
      id: saved.id,
      vendor: saved.vendor,
      amount: saved.amount,
      invoiceNumber: saved.invoiceNumber,
      invoiceDate: saved.invoiceDate,
      imageUrl: saved.imageUrl,
      poId: saved.poId,
      receiptId: saved.receiptId,
      lines: saved.lines,
    });

    return NextResponse.json({
      invoice: saved,
      match: result.match,
      priceAlerts: result.priceAlerts,
      catchWeightAlerts: result.catchWeightAlerts,
      expenseId: result.expenseId,
      inventoryUpdated: result.inventoryUpdated,
      recipesUpdated: result.recipesUpdated,
      pushNotifications: result.pushNotifications,
    });
  } catch (err) {
    console.error("Invoice save error:", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const invoices = await prisma.vendorInvoice.findMany({
    where: { locationId },
    include: { lines: true, po: true, receipt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ invoices });
}
