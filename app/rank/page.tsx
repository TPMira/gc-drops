import AttackRankCreate from "@/app/components/AttackRankCreate";
import CharacterIcon from "@/app/components/CharacterIcon";
import {
  computeAttackRankScore,
  DEFAULT_ATTACK_RANK_WEIGHTS,
  type AttackRankEntry,
} from "@/lib/attackRank";
import { readJson } from "@/lib/jsondb";

export const dynamic = "force-dynamic";

export default async function RankPage() {
  const ranks = ((await readJson("attackRanks.json")) ?? []) as AttackRankEntry[];
  const entries = ranks
    .map((e) => {
      const { score, breakdown } = computeAttackRankScore(e.stats);
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
      <div className="relative z-10 max-w-5xl mx-auto p-6">
        <div className="mb-6 rounded-lg border border-white/10 bg-black/25 backdrop-blur">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Rank de Ataque da Genesis</h1>
              <p className="text-sm text-gray-300 mt-1">
                Pontuação baseada apenas em: <b>Ataque</b>, <b>Acerto Crítico</b>,{" "}
                <b>Dano Crítico</b>, <b>Ataque Especial</b> e <b>Dano pelas Costas</b>.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 backdrop-blur p-4 mb-6">
          <div className="text-sm text-gray-200">
            <div className="font-semibold mb-1">Fórmula (resumo)</div>
            <div className="text-gray-300">
              Score = (Atk + AtkEsp × {DEFAULT_ATTACK_RANK_WEIGHTS.specialAttackToAttack}) × (1 + Costas%) × (1 + ChanceCrit(c/100) × DanoCrit%)
            </div>
            <div className="text-gray-400 mt-2">
              Obs: Chance Crítica é capada em {DEFAULT_ATTACK_RANK_WEIGHTS.critChanceCapPct}%.
            </div>
          </div>
        </div>

        <AttackRankCreate />

        {entries.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/20 backdrop-blur p-4 text-gray-300 text-sm italic">
            Nenhuma entrada cadastrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 backdrop-blur">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-black/50 backdrop-blur">
                  <th className="border border-white/10 p-2 text-center">#</th>
                  <th className="border border-white/10 p-2 text-left">Name</th>
                  <th className="border border-white/10 p-2 text-center">Char</th>
                  <th className="border border-white/10 p-2 text-right"> ⚔️ Atk</th>
                  <th className="border border-white/10 p-2 text-right"> 🎯 Crit%</th>
                  <th className="border border-white/10 p-2 text-right"> 💥 Dano Crit%</th>
                  <th className="border border-white/10 p-2 text-right"> ✨ Atk Esp</th>
                  <th className="border border-white/10 p-2 text-right"> 🗡️ Costas%</th>
                  <th className="border border-white/10 p-2 text-right"> 🏆 Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => (
                  <tr
                    key={e.id}
                    className={idx % 2 === 0 ? "bg-white/5" : "bg-transparent"}
                  >
                    <td className="border border-white/10 p-2 text-center">{idx + 1}</td>
                    <td className="border border-white/10 p-2 text-left">
                      <div className="font-medium text-zinc-100">{e.name}</div>
                      {/* {e.updatedAt ? (
                        <div className="text-xs text-gray-400">
                          {new Date(e.updatedAt).toLocaleString()}
                        </div>
                      ) : null} */}
                    </td>
                    <td className="border border-white/10 p-2 text-center text-gray-200">
                      <CharacterIcon character={e.character} size={34} />
                    </td>
                    <td className="border border-white/10 p-2 text-right">{e.stats.attack}</td>
                    <td className="border border-white/10 p-2 text-right">
                      {e.stats.critChancePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 p-2 text-right">
                      {e.stats.critDamagePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 p-2 text-right">{e.stats.specialAttack}</td>
                    <td className="border border-white/10 p-2 text-right">
                      {e.stats.backAttackDamagePct.toFixed(2)}%
                    </td>
                    <td className="border border-white/10 p-2 text-right font-semibold text-amber-200">
                      {Math.round(e.score).toLocaleString()}
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