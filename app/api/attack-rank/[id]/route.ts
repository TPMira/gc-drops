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

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
    const next = existing.filter((e) => e.id !== id);

    if (next.length === existing.length) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }

    await writeJson("attackRanks.json", next);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await req.json();

    const nameRaw = body?.name;
    const characterRaw = body?.character;
    const statsRaw = body?.stats;

    const name =
      nameRaw === undefined || nameRaw === null ? undefined : String(nameRaw).trim();
    const character =
      characterRaw === undefined || characterRaw === null
        ? undefined
        : String(characterRaw).trim();

    const existing = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
    const idx = existing.findIndex((e) => e.id === id);

    if (idx < 0) {
      return NextResponse.json({ error: "entry not found" }, { status: 404 });
    }

    const prev = existing[idx];
    const nextStats = statsRaw ? normalizeStats(statsRaw) : prev.stats;

    if (nextStats.attack <= 0) {
      return NextResponse.json({ error: "attack must be > 0" }, { status: 400 });
    }

    const updated: AttackRankEntry = {
      ...prev,
      name: name !== undefined ? name : prev.name,
      character: character !== undefined ? (character ? character : undefined) : prev.character,
      stats: nextStats,
      updatedAt: new Date().toISOString(),
    };

    if (!updated.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    existing[idx] = updated;
    await writeJson("attackRanks.json", existing);

    return NextResponse.json({ ok: true, entry: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
