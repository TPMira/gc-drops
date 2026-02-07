import RunForm from "./RunForm";
import { readJson } from "@/lib/jsondb";

export default async function NewRunPage() {
  const maps = (await readJson("maps.json")) ?? [];
  const characters = (await readJson("characters.json")) ?? [];

  return (
    <div className=" mx-auto h-screen">
      {/* Passa os dados para o client component via props */}
      {/* @ts-ignore Server -> Client prop serialização */}
      <RunForm maps={maps} characters={characters} />
    </div>
  );
}
