import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/jsondb";

type MapItem = { id: string; name: string; rarity?: string; imageUrl?: string };
type MapType = { id: string; name: string; imageUrl?: string; items: MapItem[] };

// GET - Lista todos os mapas
export async function GET() {
  try {
    const maps = (await readJson("maps.json")) ?? [];
    return NextResponse.json({ ok: true, maps });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Criar novo mapa
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, imageUrl } = body;
    
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Nome do mapa é obrigatório" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    
    // Gera ID baseado no nome
    const id = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Verifica se já existe
    if (maps.some((m) => m.id === id)) {
      return NextResponse.json({ error: "Já existe um mapa com esse nome" }, { status: 400 });
    }

    const newMap: MapType = {
      id,
      name: name.trim(),
      imageUrl: imageUrl?.trim() || undefined,
      items: [],
    };

    maps.push(newMap);
    await writeJson("maps.json", maps);

    return NextResponse.json({ ok: true, map: newMap });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT - Atualizar mapa existente
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, imageUrl } = body;
    
    if (!id) {
      return NextResponse.json({ error: "ID do mapa é obrigatório" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    const mapIndex = maps.findIndex((m) => m.id === id);
    
    if (mapIndex === -1) {
      return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
    }

    if (name) maps[mapIndex].name = name.trim();
    if (imageUrl !== undefined) maps[mapIndex].imageUrl = imageUrl?.trim() || undefined;

    await writeJson("maps.json", maps);

    return NextResponse.json({ ok: true, map: maps[mapIndex] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Remover mapa
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "ID do mapa é obrigatório" }, { status: 400 });
    }

    const maps: MapType[] = (await readJson("maps.json")) ?? [];
    const newMaps = maps.filter((m) => m.id !== id);
    
    if (newMaps.length === maps.length) {
      return NextResponse.json({ error: "Mapa não encontrado" }, { status: 404 });
    }

    await writeJson("maps.json", newMaps);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
