import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/jsondb";
import type { AttackRankEntry, AttackRankStats } from "@/lib/attackRank";

function toNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStats(stats: Partial<AttackRankStats> | undefined): AttackRankStats {
  return {
    attack: toNumber(stats?.attack),
    critChancePct: toNumber(stats?.critChancePct),
    critDamagePct: toNumber(stats?.critDamagePct),
    specialAttack: toNumber(stats?.specialAttack),
    backAttackDamagePct: toNumber(stats?.backAttackDamagePct),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    const characterRaw = body?.character;
    const character =
      characterRaw === undefined || characterRaw === null
        ? undefined
        : String(characterRaw).trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const stats = normalizeStats(body?.stats);

    if (stats.attack <= 0) {
      return NextResponse.json({ error: "attack must be > 0" }, { status: 400 });
    }

    const existing = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];

    const entry: AttackRankEntry = {
      id: "atk_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name,
      character: character ? character : undefined,
      stats,
      updatedAt: new Date().toISOString(),
    };

    existing.push(entry);
    await writeJson("attackRanks.json", existing);

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
