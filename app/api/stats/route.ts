import { NextResponse } from "next/server";
import { readJson } from "@/lib/jsondb";

export async function GET() {
  const characters = (await readJson("characters.json")) ?? [];
  const maps = (await readJson("maps.json")) ?? [];
  const items = (await readJson("items.json")) ?? [];
  const runs = (await readJson("runs.json")) ?? [];

  const totalRuns = runs.length;

  // Contador por item
  const counts: Record<string, number> = {};

interface Item {
    id: number | string;
    name: string;
}

interface Run {
    itemId?: number | string;
}

  runs.forEach((run: Run) => {
    if (run.itemId) {
      const it = items.find((i: Item) => i.id === run.itemId);
      if (it) {
        counts[it.name] = (counts[it.name] || 0) + 1;
      }
    }
  });

  const stats = Object.entries(counts).map(([item, count]) => ({
    item,
    count,
    percentage: totalRuns > 0 ? ((count / totalRuns) * 100).toFixed(2) + "%" : "0.00%"
  }));

  return NextResponse.json({
    totalRuns,
    stats
  });
}
