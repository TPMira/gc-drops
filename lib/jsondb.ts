import fs from "fs";
import path from "path";

function filePath(file: string) {
  return path.join(process.cwd(), "data", file);
}

export function readJson(file: string) {
  const p = filePath(file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export function writeJson(file: string, data: any) {
  const p = filePath(file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
