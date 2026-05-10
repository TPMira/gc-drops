import RunForm from "./RunForm";
import { readJson } from "@/lib/jsondb";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const characters = (await readJson("characters.json")) ?? [];

  return (
    <div className=" mx-auto h-screen">
      {/* Passa apenas os personagens para o client component */}
      {/* @ts-ignore Server -> Client prop serialização */}
      <RunForm characters={characters} />
    </div>
  );
}
