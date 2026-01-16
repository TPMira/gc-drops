import { readJson } from "@/lib/jsondb";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const maps = (await readJson<any[]>("maps.json")) ?? [];
  const runs = (await readJson<any[]>("runs.json")) ?? [];

  // classes por raridade (tema escuro)
  const rarityColor: Record<string, string> = {
    Common: "bg-gray-700 text-gray-100",
    Uncommon: "bg-green-700 text-green-50",
    Rare: "bg-blue-700 text-blue-50",
    Epic: "bg-yellow-500/20 text-yellow-300",
    Legendary: "bg-purple-500/20 text-purple-300",
    Ancestral: "bg-rose-500/20 text-rose-300",
  };
  const badgeClass = (r?: string) =>
    `text-2xs px-2 py-0.5 rounded ${r && rarityColor[r] ? rarityColor[r] : "bg-zinc-700 text-zinc-100"}`;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Estatísticas de Drop</h1>
      <p className="text-sm text-gray-400 mb-6">
        Resumo por mapa com taxa de drop, quantidade total e média por ocorrência.
      </p>

      {maps.map((map: any) => {
        const mapRuns = runs.filter((r: any) => r.mapId === map.id);
        const totalRuns = mapRuns.length;

        const itemStats = map.items
          .map((item: any) => {
            let runsWithItem = 0;
            let qtyTotal = 0;
            for (const run of mapRuns) {
              const found = run.itemsFound?.find((it: any) => it.itemId === item.id);
              if (found && Number(found.qty) > 0) {
                runsWithItem++;
                qtyTotal += Number(found.qty);
              }
            }
            const dropRate = totalRuns > 0 ? (runsWithItem / totalRuns) * 100 : 0;
            const avgQty = runsWithItem > 0 ? qtyTotal / runsWithItem : 0;
            return { item, runsWithItem, qtyTotal, dropRate, avgQty };
          })
          .sort((a: any, b: any) => b.dropRate - a.dropRate);

        const runsWithAnyDrop = mapRuns.filter(
          (r: any) =>
            Array.isArray(r.itemsFound) &&
            r.itemsFound.some((it: any) => Number(it?.qty) > 0)
        ).length;

        const maxQtyTotal =
          itemStats.length > 0
            ? itemStats.reduce((m: number, s: any) => Math.max(m, s.qtyTotal), 0)
            : 0;
        const maxDropRate = itemStats.length > 0 ? itemStats[0].dropRate : 0;

        return (
          <section key={map.id} className="mb-10 rounded-lg border border-white/10 bg-white/3">
            <div className="p-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">{map.name}</h2>
                <p className="text-sm text-gray-400">
                  Total de runs: <b>{totalRuns}</b> • Runs com algum drop: <b>{runsWithAnyDrop}</b>
                </p>
              </div>
              {totalRuns > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-300">
                    Maior drop rate: {maxDropRate.toFixed(2)}%
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300">
                    Maior quantidade: {maxQtyTotal}
                  </span>
                </div>
              )}
            </div>

            {totalRuns === 0 ? (
              <div className="p-4 text-gray-500 text-sm italic">Nenhuma run registrada ainda para este mapa.</div>
            ) : (
              <div className="relative">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-black/40 backdrop-blur">
                        <th className="border border-white/10 p-2 text-left">Item</th>
                        <th className="border border-white/10 p-2 text-center">Runs com Drop</th>
                        <th className="border border-white/10 p-2 text-center">Qtd Total</th>
                        <th className="border border-white/10 p-2 text-center">Drop Rate</th>
                        <th className="border border-white/10 p-2 text-center">Média por Drop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemStats.map((s: any, idx: number) => (
                        <tr key={s.item.id} className={idx % 2 === 0 ? "bg-white/2" : "bg-transparent"}>
                          <td className="border border-white/10 p-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{s.item.name}</span>
                              {s.item.rarity && <span className={badgeClass(s.item.rarity)}>{s.item.rarity}</span>}
                            </div>
                          </td>
                          <td className="border border-white/10 p-2 text-center">{s.runsWithItem}</td>
                          <td className="border border-white/10 p-2 text-center">
                            <div className="flex items-center gap-2 justify-center">
                              {s.qtyTotal}
                              <div className="w-24 h-2 bg-white/10 rounded overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500/80"
                                  style={{
                                    width: `${Math.min(100, (s.qtyTotal / Math.max(1, maxQtyTotal)) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="border border-white/10 p-2 text-center">
                            <div className="flex items-center gap-2 justify-center">
                              {s.dropRate.toFixed(2)}%
                              <div className="w-24 h-2 bg-white/10 rounded overflow-hidden">
                                <div className="h-full bg-blue-500/80" style={{ width: `${s.dropRate}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="border border-white/10 p-2 text-center">{s.avgQty.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
