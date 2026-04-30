import fs from "node:fs";
import path from "node:path";

function findDataDir(): string {
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
    path.join(process.cwd(), "..", "..", "data"),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // ignore
    }
  }

  // Fallback (so writes create the folder)
  return candidates[0];
}

function dataFilePath(file: string) {
  return path.join(findDataDir(), file);
}

export async function readJson<T = any>(file: string): Promise<T | null> {
  const p = dataFilePath(file);
  if (!fs.existsSync(p)) return null;
  const raw = await fs.promises.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  const p = dataFilePath(file);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}
