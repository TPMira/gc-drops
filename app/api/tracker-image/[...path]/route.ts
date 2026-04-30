import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const SCREEN_TRACKER_DIR = path.join(process.cwd(), "screen-tracker");

const ALLOWED_FOLDERS = ["templates", "maps", "output"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const folder = segments[0];
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filePath = path.join(SCREEN_TRACKER_DIR, ...segments);
  // Prevent traversal
  if (!filePath.startsWith(SCREEN_TRACKER_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=60",
    },
  });
}
