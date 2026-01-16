import RunForm from "./RunForm";
import { readJson } from "@/lib/jsondb";

export default async function NewRunPage() {
  const maps = (await readJson("maps.json")) ?? [];
  const characters = (await readJson("characters.json")) ?? [];

  return (
    <div className="max-w-3xl mx-auto h-screen p-6">
      {/* Passa os dados para o client component via props */}
      {/* @ts-ignore Server -> Client prop serialização */}
      <RunForm maps={maps} characters={characters} />
    </div>
  );
}
