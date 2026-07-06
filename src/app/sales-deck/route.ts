import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const SALES_DECK_PATH = path.join(process.cwd(), "private", "sales-deck.html");

function prepareSalesDeckHtml(html: string): string {
  return html
    .replace(/src="\.\/assets\//g, 'src="/docs/assets/')
    .replace(/href="\.\/assets\//g, 'href="/docs/assets/')
    .replace(/src="\.\.\/docs\/assets\//g, 'src="/docs/assets/')
    .replace(/href="\.\.\/docs\/assets\//g, 'href="/docs/assets/');
}

/** Unlisted sales deck — not linked from the public site. Requires ?key= matching SALES_DECK_ACCESS_KEY. */
export async function GET(request: NextRequest) {
  const accessKey = process.env.SALES_DECK_ACCESS_KEY?.trim();
  if (!accessKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (!key || key !== accessKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const raw = await readFile(SALES_DECK_PATH, "utf-8");
    return new NextResponse(prepareSalesDeckHtml(raw), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
