import {
  computeAttackRankScore,
  DEFAULT_ATTACK_RANK_WEIGHTS,
  type AttackRankEntry,
} from "@/lib/attackRank";
import { readJson } from "@/lib/jsondb";
import RankBoards, { type AttackRankComputedEntry } from "./RankBoards";

export const dynamic = "force-dynamic";

export default async function RankPage() {
  const ranks120 = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
  const ranks100 = ((await readJson("attackRanks100.json")) ?? []) as AttackRankEntry[];

  const entries120: AttackRankComputedEntry[] = ranks120
    .map((e) => {
      const { score, breakdown } = computeAttackRankScore(e.stats, {
        ...DEFAULT_ATTACK_RANK_WEIGHTS,
        critChanceCapPct: 120,
      });
      return { ...e, score, breakdown };
    })
    .sort((a, b) => b.score - a.score);

  const entries100: AttackRankComputedEntry[] = ranks100
    .map((e) => {
      const { score, breakdown } = computeAttackRankScore(e.stats, {
        ...DEFAULT_ATTACK_RANK_WEIGHTS,
        critChanceCapPct: 100,
      });
      return { ...e, score, breakdown };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070b16] text-zinc-100">
      {/* Camada 1: Fundo (gradientes) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 500px at 15% 15%, rgba(65,130,255,0.22), transparent 60%), radial-gradient(700px 450px at 85% 30%, rgba(255,190,90,0.16), transparent 62%), radial-gradient(900px 700px at 50% 110%, rgba(110,70,255,0.18), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 35%)",
        }}
      />

      {/* Camada 2: Overlay (scanlines + grid leve + vinheta) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-50 mix-blend-overlay"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), repeating-linear-gradient(180deg, rgba(0,0,0,0.0) 0px, rgba(0,0,0,0.0) 2px, rgba(0,0,0,0.22) 3px)",
          backgroundSize: "64px 64px, 64px 64px, 100% 3px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(closest-side at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Camada 3: Conteúdo */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 rounded-lg border border-white/10 bg-black/25 backdrop-blur">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Rank de Ataque da Genesis</h1>
              <p className="text-base sm:text-lg text-gray-300 mt-1">
                Pontuação baseada apenas em: <b>Ataque</b>, <b>Acerto Crítico</b>,{" "}
                <b>Dano Crítico</b>, <b>Ataque Especial</b> e <b>Dano pelas Costas</b>.
              </p>
            </div>
          </div>
        </div>

        <RankBoards entries120={entries120} entries100={entries100} />
      </div>
    </div>
  );
}