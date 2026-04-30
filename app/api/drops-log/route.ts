import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const DROPS_LOG_PATH = path.join(
  process.cwd(),
  "screen-tracker",
  "output",
  "drops_log.json"
);

export const dynamic = "force-dynamic";

export async function GET() {
  if (!fs.existsSync(DROPS_LOG_PATH)) {
    return NextResponse.json([]);
  }
  const raw = await fs.promises.readFile(DROPS_LOG_PATH, "utf8");
  const data = JSON.parse(raw);
  return NextResponse.json(data);
}
