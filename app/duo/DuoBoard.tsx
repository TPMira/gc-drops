"use client";

import { useMemo, useState } from "react";
import CharacterIcon from "@/app/components/CharacterIcon";
import MapIcon from "@/app/components/MapIcon";
import { useToast } from "@/app/components/ToastProvider";

export type DuoQueue = {
  id: string;
  title: string;
  map: string;
  lookingFor: "DPS" | "SUP" | "ANY";
  note?: string;
  leader: {
    name: string;
    character?: string;
  };
  createdAt?: string;
};

type Props = {
  initialQueues: DuoQueue[];
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function DuoBoard({ initialQueues }: Props) {
  const { notify } = useToast();

  const [queues, setQueues] = useState<DuoQueue[]>(initialQueues);
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("ALL");
  const [role, setRole] = useState<"ALL" | DuoQueue["lookingFor"]>("ALL");

  const maps = useMemo(() => {
    const unique = new Set<string>();
    for (const q of queues) unique.add(q.map);
    return ["ALL", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [queues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queues
      .filter((x) => (map === "ALL" ? true : x.map === map))
      .filter((x) => (role === "ALL" ? true : x.lookingFor === role))
      .filter((x) => {
        if (!q) return true;
        const hay = `${x.title} ${x.map} ${x.note ?? ""} ${x.leader.name} ${x.leader.character ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [map, query, queues, role]);

  function createDemoQueue() {
    const newQueue: DuoQueue = {
      id: `dq_local_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: "Duo Calnat (novo)",
      map: "Calnat",
      lookingFor: "ANY",
      note: "Fila de exemplo criada no client.",
      leader: { name: "Você", character: "—" },
      createdAt: new Date().toISOString(),
    };
    setQueues((prev) => [newQueue, ...prev]);
    notify("Fila criada (exemplo)", "success");
  }

  function joinQueue(q: DuoQueue) {
    notify(`Você entrou na fila: ${q.title}`, "info");
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 backdrop-blur p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-semibold">Filas abertas</div>
          <div className="text-sm text-gray-400">Simulação com algumas filas de exemplo.</div>
        </div>

        <button
          type="button"
          className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm hover:bg-black/60"
          onClick={createDemoQueue}
        >
          + Criar fila (exemplo)
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          className="min-w-60 flex-1 rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="Buscar por mapa, líder, nota..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <select
          className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
          value={map}
          onChange={(e) => setMap(e.target.value)}
        >
          {maps.map((m) => (
            <option key={m} value={m}>
              {m === "ALL" ? "Todos os mapas" : m}
            </option>
          ))}
        </select>

        <select
          className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
        >
          <option value="ALL">Qualquer role</option>
          <option value="DPS">Procurando DPS</option>
          <option value="SUP">Procurando SUP</option>
          <option value="ANY">Procurando ANY</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 text-sm text-gray-400 italic">Nenhuma fila encontrada.</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-black/50 backdrop-blur">
                <th className="border border-white/10 p-2 text-left">Título</th>
                <th className="border border-white/10 p-2 text-left">Mapa</th>
                <th className="border border-white/10 p-2 text-left">Líder</th>
                <th className="border border-white/10 p-2 text-left">Personagem</th>
                <th className="border border-white/10 p-2 text-left">Procurando</th>
                <th className="border border-white/10 p-2 text-left">Criada</th>
                <th className="border border-white/10 p-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, idx) => (
                <tr key={q.id} className={idx % 2 === 0 ? "bg-white/5" : "bg-transparent"}>
                  <td className="border border-white/10 p-2">
                    <div className="font-medium text-zinc-100">{q.title}</div>
                    {q.note ? <div className="text-xs text-gray-400">{q.note}</div> : null}
                  </td>
                  <td className="border border-white/10 p-2">
                    <MapIcon map={q.map} width={86} height={32} showLabel />
                  </td>
                  <td className="border border-white/10 p-2 text-gray-200">{q.leader.name}</td>
                  <td className="border border-white/10 p-2">
                    <CharacterIcon character={q.leader.character} size={32  } />
                  </td>
                  <td className="border border-white/10 p-2">
                    <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-400/20 text-blue-200 text-xs">
                      {q.lookingFor} a
                    </span>
                  </td>
                  <td className="border border-white/10 p-2 text-gray-400">{fmtTime(q.createdAt)}</td>
                  <td className="border border-white/10 p-2 text-right">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded bg-black/40 border border-white/10 text-sm hover:bg-black/60"
                      onClick={() => joinQueue(q)}
                    >
                      Entrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
