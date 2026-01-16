import fs from "node:fs";
import path from "node:path";

function dataFilePath(file: string) {
  return path.join(process.cwd(), "data", file);
}

function kvEnabled() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isVercel() {
  return process.env.VERCEL === "1";
}

function kvKey(file: string) {
  return `jsondb:${file}`;
}

async function readLocalJson<T>(file: string): Promise<T | null> {
  const p = dataFilePath(file);
  if (!fs.existsSync(p)) return null;
  const raw = await fs.promises.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

async function writeLocalJson(file: string, data: unknown): Promise<void> {
  const p = dataFilePath(file);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2));
}

export async function readJson<T = any>(file: string): Promise<T | null> {
  if (kvEnabled()) {
    const { kv } = await import("@vercel/kv");
    const key = kvKey(file);
    const stored = (await kv.get(key)) as T | null;
    if (stored !== null && stored !== undefined) return stored;

    // Seed KV from the bundled local JSON on first access.
    const local = await readLocalJson<T>(file);
    if (local !== null) {
      await kv.set(key, local);
    }
    return local;
  }

  return readLocalJson<T>(file);
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  if (kvEnabled()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(kvKey(file), data);
    return;
  }

  if (isVercel()) {
    throw new Error(
      "Storage is read-only on Vercel. Configure Vercel KV (KV_REST_API_URL/KV_REST_API_TOKEN) to enable writes."
    );
  }

  await writeLocalJson(file, data);
}
