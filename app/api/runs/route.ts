import { NextResponse } from "next/server";
import { readJson } from "@/lib/jsondb";

export async function GET() {
  try {
    const runs = (await readJson("runs.json")) ?? [];
    return NextResponse.json({ ok: true, runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
