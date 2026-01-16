'use server';

type ItemFound = { itemId: string; qty: number };

export async function saveRun(formData: FormData) {
  const characterId = formData.get('characterId') as string;
  const mapId = formData.get('mapId') as string;
  const itemsJson = formData.get('itemsFound') as string;
  const itemsFound: ItemFound[] = itemsJson ? JSON.parse(itemsJson) : [];

  // TODO: persista no seu storage (DB, arquivo, etc)
  // Ex.: await db.runs.insert({ characterId, mapId, itemsFound, createdAt: new Date() });

  return { ok: true };
}