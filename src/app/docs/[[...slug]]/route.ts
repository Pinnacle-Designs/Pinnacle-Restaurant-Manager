import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const DOCS_ROOT = path.join(process.cwd(), "docs");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function resolveDocsPath(segments: string[] | undefined): string | null {
  const parts = segments?.length ? segments : ["index.html"];
  if (parts[0] === "private") return null;
  const joined = path.normalize(path.join(...parts));
  if (joined.startsWith("..")) return null;
  const full = path.join(DOCS_ROOT, joined);
  if (!full.startsWith(DOCS_ROOT)) return null;
  return full;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await context.params;
  const filePath = resolveDocsPath(slug);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const raw = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let body: BodyInit = new Uint8Array(raw);

    if (ext === ".html" && (!slug?.length || (slug.length === 1 && slug[0] === "index.html"))) {
      const html = raw.toString("utf-8");
      if (!html.includes("<base ")) {
        body = html.replace("<head>", '<head>\n  <base href="/docs/" />');
      } else {
        body = html;
      }
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
