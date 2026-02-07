import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/jsondb";

type MapItem = { id: string; name: string; rarity?: string; imageUrl?: string };
type MapType = { id: string; name: string; imageUrl?: string; items: MapItem[] };

// POST - Adicionar item a um mapa
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mapId, name, rarity, imageUrl } = body;
    
    if (!mapId || !name) {
      return NextResponse.json({ error: "mapId e name são obrigatórios" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    const mapIndex = maps.findIndex((m) => m.id === mapId);
    
    if (mapIndex === -1) {
      return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
    }

    // Gera ID baseado no nome
    const id = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Verifica se já existe no mapa
    if (maps[mapIndex].items.some((i) => i.id === id)) {
      return NextResponse.json({ error: "Já existe um item com esse nome neste mapa" }, { status: 400 });
    }

    const newItem: MapItem = {
      id,
      name: name.trim(),
      rarity: rarity?.trim() || undefined,
      imageUrl: imageUrl?.trim() || undefined,
    };

    maps[mapIndex].items.push(newItem);
    await writeJson("maps.json", maps);

    return NextResponse.json({ ok: true, item: newItem });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT - Atualizar item de um mapa
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { mapId, itemId, name, rarity, imageUrl } = body;
    
    if (!mapId || !itemId) {
      return NextResponse.json({ error: "mapId e itemId são obrigatórios" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    const mapIndex = maps.findIndex((m) => m.id === mapId);
    
    if (mapIndex === -1) {
      return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
    }

    const itemIndex = maps[mapIndex].items.findIndex((i) => i.id === itemId);
    
    if (itemIndex === -1) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    if (name) maps[mapIndex].items[itemIndex].name = name.trim();
    if (rarity !== undefined) maps[mapIndex].items[itemIndex].rarity = rarity?.trim() || undefined;
    if (imageUrl !== undefined) maps[mapIndex].items[itemIndex].imageUrl = imageUrl?.trim() || undefined;

    await writeJson("maps.json", maps);

    return NextResponse.json({ ok: true, item: maps[mapIndex].items[itemIndex] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Remover item de um mapa
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mapId = searchParams.get("mapId");
    const itemId = searchParams.get("itemId");
    
    if (!mapId || !itemId) {
      return NextResponse.json({ error: "mapId e itemId são obrigatórios" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    const mapIndex = maps.findIndex((m) => m.id === mapId);
    
    if (mapIndex === -1) {
      return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
    }

    const originalLength = maps[mapIndex].items.length;
    maps[mapIndex].items = maps[mapIndex].items.filter((i) => i.id !== itemId);
    
    if (maps[mapIndex].items.length === originalLength) {
      return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
    }

    await writeJson("maps.json", maps);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
