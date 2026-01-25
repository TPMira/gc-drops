"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttackRankEntry } from "@/lib/attackRank";
import AttackRankRowActions from "@/app/components/AttackRankRowActions";
import { AttackRankCreateWithEndpoint } from "@/app/components/AttackRankCreate";
import CharacterIcon from "@/app/components/CharacterIcon";

export type AttackRankComputedEntry = AttackRankEntry & {
  score: number;
  breakdown?: any;
};

type Filters = {
  name: string;
  character: string;
  atkMin: string;
  critMin: string;
  scoreMin: string;
};

type SortKey =
  | "name"
  | "character"
  | "attack"
  | "critChancePct"
  | "critDamagePct"
  | "specialAttack"
  | "backAttackDamagePct"
  | "score";

type SortState = { key: SortKey; dir: "asc" | "desc" };

function toNumber(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function filterEntries(entries: AttackRankComputedEntry[], filters: Filters) {
  const nameNeedle = filters.name.trim().toLowerCase();
  const charNeedle = filters.character.trim().toLowerCase();
  const atkMin = toNumber(filters.atkMin);
  const critMin = toNumber(filters.critMin);
  const scoreMin = toNumber(filters.scoreMin);

  return entries.filter((e) => {
    if (nameNeedle && !String(e.name ?? "").toLowerCase().includes(nameNeedle)) return false;
    if (charNeedle && !String(e.character ?? "").toLowerCase().includes(charNeedle)) return false;
    if (atkMin !== null && Number(e.stats?.attack ?? 0) < atkMin) return false;
    if (critMin !== null && Number(e.stats?.critChancePct ?? 0) < critMin) return false;
    if (scoreMin !== null && Number(e.score ?? 0) < scoreMin) return false;
    return true;
  });
}

function compare(a: AttackRankComputedEntry, b: AttackRankComputedEntry, key: SortKey) {
  switch (key) {
    case "name":
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
        sensitivity: "base",
      });
    case "character":
      return String(a.character ?? "").localeCompare(String(b.character ?? ""), undefined, {
        sensitivity: "base",
      });
    case "attack":
      return Number(a.stats?.attack ?? 0) - Number(b.stats?.attack ?? 0);
    case "critChancePct":
      return Number(a.stats?.critChancePct ?? 0) - Number(b.stats?.critChancePct ?? 0);
    case "critDamagePct":
      return Number(a.stats?.critDamagePct ?? 0) - Number(b.stats?.critDamagePct ?? 0);
    case "specialAttack":
      return Number(a.stats?.specialAttack ?? 0) - Number(b.stats?.specialAttack ?? 0);
    case "backAttackDamagePct":
      return Number(a.stats?.backAttackDamagePct ?? 0) - Number(b.stats?.backAttackDamagePct ?? 0);
    case "score":
      return Number(a.score ?? 0) - Number(b.score ?? 0);
  }
}

export default function RankBoards({
  entries120,
  entries100,
}: {
  entries120: AttackRankComputedEntry[];
  entries100: AttackRankComputedEntry[];
}) {
  const [mode, setMode] = useState<"120" | "100">("120");
  const [filters, setFilters] = useState<Filters>({
    name: "",
    character: "",
    atkMin: "",
    critMin: "",
    scoreMin: "",
  });

  const [sort, setSort] = useState<SortState>({ key: "score", dir: "desc" });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rankMode");
      if (saved === "120" || saved === "100") setMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("rankMode", mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const config = useMemo(() => {
    return mode === "120"
      ? {
          title: "Build 120% Crit (cap)",
          subtitle: "Tabela para builds com cap de 120% de acerto crítico.",
          createEndpoint: "/api/attack-rank",
          actionsBasePath: "/api/attack-rank",
          entries: entries120,
        }
      : {
          title: "Build 100% Crit (cap)",
          subtitle: "Tabela para builds com cap de 100% de acerto crítico.",
          createEndpoint: "/api/attack-rank-100",
          actionsBasePath: "/api/attack-rank-100",
          entries: entries100,
        };
  }, [entries100, entries120, mode]);

  const filtered = useMemo(() => {
    const base = filterEntries(config.entries, filters);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => dir * compare(a, b, sort.key));
  }, [config.entries, filters, sort.dir, sort.key]);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" };
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  }

  function SortHeader({
    label,
    sortKey,
    align = "left",
  }: {
    label: string;
    sortKey: SortKey;
    align?: "left" | "center" | "right";
  }) {
    const active = sort.key === sortKey;
    const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";

    const alignClass =
      align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={[
          "w-full inline-flex items-center gap-2",
          alignClass,
          "hover:text-white",
          active ? "text-white" : "text-zinc-200",
        ].join(" ")}
      >
        <span>{label}</span>
        <span className={["text-xs opacity-80", active ? "opacity-100" : "opacity-40"].join(" ")}>{arrow || "↕"}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("120")}
            className={[
              "px-3 py-2 rounded border text-sm sm:text-base",
              mode === "120"
                ? "bg-blue-500/15 border-blue-400/30 text-blue-100"
                : "bg-black/30 border-white/10 text-gray-200 hover:bg-black/50",
            ].join(" ")}
          >
            Build 120
          </button>
          <button
            type="button"
            onClick={() => setMode("100")}
            className={[
              "px-3 py-2 rounded border text-sm sm:text-base",
              mode === "100"
                ? "bg-amber-500/15 border-amber-400/30 text-amber-100"
                : "bg-black/30 border-white/10 text-gray-200 hover:bg-black/50",
            ].join(" ")}
          >
            Build 100
          </button>
        </div>

        <div className="text-sm sm:text-base text-gray-300">
          Mostrando <b>{filtered.length}</b> de <b>{config.entries.length}</b>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 backdrop-blur p-4">
        <div className="font-semibold text-lg sm:text-xl">{config.title}</div>
        <div className="text-sm sm:text-base text-gray-400 mt-1">{config.subtitle}</div>

        <div className="mt-4">
          <AttackRankCreateWithEndpoint
            endpoint={config.createEndpoint}
            title={mode === "120" ? "Cadastrar (Build 120)" : "Cadastrar (Build 100)"}
            subtitle="Adiciona uma nova entrada nesta tabela."
            buttonLabel="Cadastrar"
          />
        </div>

        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <input
            className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Filtrar Name"
            value={filters.name}
            onChange={(e) => setFilters((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Filtrar Char"
            value={filters.character}
            onChange={(e) => setFilters((s) => ({ ...s, character: e.target.value }))}
          />
          <input
            className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Atk ≥"
            inputMode="numeric"
            value={filters.atkMin}
            onChange={(e) => setFilters((s) => ({ ...s, atkMin: e.target.value }))}
          />
          <input
            className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
            placeholder="Crit% ≥"
            inputMode="decimal"
            value={filters.critMin}
            onChange={(e) => setFilters((s) => ({ ...s, critMin: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
              placeholder="Score ≥"
              inputMode="numeric"
              value={filters.scoreMin}
              onChange={(e) => setFilters((s) => ({ ...s, scoreMin: e.target.value }))}
            />
            <button
              type="button"
              className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm hover:bg-black/60"
              onClick={() =>
                setFilters({ name: "", character: "", atkMin: "", critMin: "", scoreMin: "" })
              }
            >
              Limpar
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-gray-300 text-sm italic">
            Nenhuma entrada encontrada com esses filtros.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black/20 backdrop-blur">
            <table className="w-full border-collapse text-sm sm:text-[15px] lg:text-base xl:text-lg leading-6">
              <thead className="sticky top-0 z-10">
                <tr className="bg-black/60 backdrop-blur text-zinc-100">
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-center">#</th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="Name" sortKey="name" align="left" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="Char" sortKey="character" align="center" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="⚔️ Atk" sortKey="attack" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="🎯 Crit%" sortKey="critChancePct" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="💥 Dano Crit%" sortKey="critDamagePct" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="✨ Atk Esp" sortKey="specialAttack" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="🗡️ Costas%" sortKey="backAttackDamagePct" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3">
                    <SortHeader label="🏆 Score" sortKey="score" align="right" />
                  </th>
                  <th className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr key={e.id} className={idx % 2 === 0 ? "bg-white/5" : "bg-transparent"}>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-center">{idx + 1}</td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-left">
                      <div className="font-semibold text-zinc-100">{e.name}</div>
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-center text-gray-200">
                      <CharacterIcon character={e.character} size={38} />
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">{e.stats.attack}</td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                      {e.stats.critChancePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                      {e.stats.critDamagePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">{e.stats.specialAttack}</td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right tabular-nums">
                      {e.stats.backAttackDamagePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-right font-bold text-amber-200 tabular-nums">
                      {Math.round(e.score).toLocaleString()}
                    </td>
                    <td className="border border-white/10 px-3 py-2 lg:px-4 lg:py-3 text-center">
                      <AttackRankRowActions entry={e} basePath={config.actionsBasePath} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
