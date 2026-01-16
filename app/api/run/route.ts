import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/jsondb";

type ItemFound = { itemId: string; qty: number };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { characterName, characterId, mapId, itemsFound } = body;
    // characterName OR characterId must be provided
    if ((!characterName && !characterId) || !mapId) {
      return NextResponse.json({ error: "characterName or characterId and mapId required" }, { status: 400 });
    }

    // load DB files
  const characters = (await readJson("characters.json")) ?? [];
  const maps = (await readJson("maps.json")) ?? [];
  const runs = (await readJson("runs.json")) ?? [];

    // ensure map exists
    const map = maps.find((m: any) => m.id === mapId);
    if (!map) {
      return NextResponse.json({ error: "map not found" }, { status: 400 });
    }

    // find or create character
    let char = null;
    if (characterId) {
      char = characters.find((c: any) => c.id === characterId);
    }
    if (!char && characterName) {
      char = characters.find((c: any) => c.name === characterName);
    }
    if (!char) {
      // create new character
      const newId = "char_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      char = { id: newId, name: characterName };
      characters.push(char);
      await writeJson("characters.json", characters);
    }

    // Validate itemsFound: ensure each itemId exists in map
    const validatedItems: ItemFound[] = [];
    if (Array.isArray(itemsFound)) {
      for (const it of itemsFound) {
        if (!it || !it.itemId) continue;
        const mapItem = map.items.find((mi: any) => mi.id === it.itemId);
        if (!mapItem) continue; // ignora item que não pertence ao mapa
        validatedItems.push({ itemId: it.itemId, qty: Number(it.qty) || 1 });
      }
    }

    // create run
    const run = {
      id: "run_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      characterId: char.id,
      mapId: map.id,
      itemsFound: validatedItems, // array de { itemId, qty }
      createdAt: new Date().toISOString()
    };

    runs.push(run);
    await writeJson("runs.json", runs);

    return NextResponse.json({ ok: true, run });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
