import fs from "fs";
import path from "path";
import RunForm from "./RunForm";

async function readJSON(file: string) {
  const p = path.join(process.cwd(), "data", file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export default async function NewRunPage() {
  const maps = (await readJSON("maps.json")) ?? [];
  const characters = (await readJSON("characters.json")) ?? [];

  return (
    <div className="max-w-3xl mx-auto h-screen p-6">
      {/* Passa os dados para o client component via props */}
      {/* @ts-ignore Server -> Client prop serialização */}
      <RunForm maps={maps} characters={characters} />
    </div>
  );
}
