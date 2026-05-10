import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Inicializa o cliente Redis usando variáveis de ambiente.
// Certifique-se de ter UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN configuradas.
const redis = Redis.fromEnv();

// GET /api/redis?key=nome_da_chave
// Se não passar `key`, retorna a lista de chaves existentes.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    // Listar todas as chaves do Redis (útil para debug).
    const keys = await redis.keys('*');
    return NextResponse.json({ keys });
  }

  // Buscar o valor da chave solicitada.
  const result = await redis.get(key);
  return NextResponse.json({ key, result });
}

// POST /api/redis
// Body JSON: { "key": "nome", "value": valor }
// Adiciona um novo valor ou atualiza uma chave existente.
export async function POST(request: Request) {
  const body = await request.json();
  const key = body.key;
  const value = body.value;

  if (!key || value === undefined) {
    return NextResponse.json(
      { error: 'Missing key or value in request body' },
      { status: 400 }
    );
  }

  await redis.set(key, value);
  return NextResponse.json({ ok: true, key, value });
}

// PUT /api/redis
// Mesma lógica de POST para editar/atualizar uma chave.
export async function PUT(request: Request) {
  const body = await request.json();
  const key = body.key;
  const value = body.value;

  if (!key || value === undefined) {
    return NextResponse.json(
      { error: 'Missing key or value in request body' },
      { status: 400 }
    );
  }

  await redis.set(key, value);
  return NextResponse.json({ ok: true, key, value });
}

// DELETE /api/redis
// Body JSON: { "key": "nome" }
// Remove a chave do Redis.
export async function DELETE(request: Request) {
  const body = await request.json();
  const key = body.key;

  if (!key) {
    return NextResponse.json(
      { error: 'Missing key in request body' },
      { status: 400 }
    );
  }

  const deleted = await redis.del(key);
  return NextResponse.json({ ok: true, key, deleted });
}
