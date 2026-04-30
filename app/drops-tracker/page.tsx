import fs from "node:fs";
import path from "node:path";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

interface Drop {
  name: string;
  row: number;
  col: number;
  score: number;
}

interface RunEntry {
  ts: number;
  monitor: number;
  map: string;
  map_score: number;
  drops: Drop[];
  drops_summary: Record<string, number>;
  unknown_count: number;
}

interface ItemStat {
  name: string;
  count: number;
  runsWithItem: number;
  dropRate: number;
  avgPerDrop: number;
}

interface MapStats {
  map: string;
  totalRuns: number;
  runsWithDrops: number;
  items: ItemStat[];
}

function prettyName(slug: string | null | undefined): string {
  if (!slug) return "Desconhecido";
  return slug
    .replace(/_r\d+_c\d+$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function templateSlug(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/_r\d+_c\d+$/, "");
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default async function DropsTrackerPage() {
  const dropsLogPath = path.join(
    process.cwd(),
    "screen-tracker",
    "output",
    "drops_log.json"
  );
  const templatesDir = path.join(process.cwd(), "screen-tracker", "templates");
  const mapsDir = path.join(process.cwd(), "screen-tracker", "maps");

  let runs: RunEntry[] = [];
  if (fs.existsSync(dropsLogPath)) {
    const raw = await fs.promises.readFile(dropsLogPath, "utf8");
    runs = JSON.parse(raw);
  }

  // Available template images
  const templateFiles = new Set<string>();
  if (fs.existsSync(templatesDir)) {
    for (const f of fs.readdirSync(templatesDir)) {
      if (/\.(png|jpe?g)$/i.test(f)) {
        templateFiles.add(f.replace(/\.(png|jpe?g)$/i, ""));
      }
    }
  }

  // Available map images
  const mapFiles = new Set<string>();
  if (fs.existsSync(mapsDir)) {
    for (const f of fs.readdirSync(mapsDir)) {
      if (/\.(png|jpe?g)$/i.test(f)) {
        mapFiles.add(f.replace(/\.(png|jpe?g)$/i, ""));
      }
    }
  }

  // Group runs by map
  const byMap = new Map<string, RunEntry[]>();
  for (const run of runs) {
    const mapName = run.map || "desconhecido";
    if (!byMap.has(mapName)) byMap.set(mapName, []);
    byMap.get(mapName)!.push(run);
  }

  // Compute stats per map
  const mapStats: MapStats[] = [];
  for (const [mapName, mapRuns] of byMap) {
    const totalRuns = mapRuns.length;
    const runsWithDrops = mapRuns.filter((r) => r.drops.length > 0).length;

    // Aggregate items
    const itemAgg = new Map<string, { count: number; runsSet: Set<number> }>();
    for (let i = 0; i < mapRuns.length; i++) {
      const run = mapRuns[i];
      for (const drop of run.drops) {
        if (!itemAgg.has(drop.name)) {
          itemAgg.set(drop.name, { count: 0, runsSet: new Set() });
        }
        const agg = itemAgg.get(drop.name)!;
        agg.count += 1;
        agg.runsSet.add(i);
      }
    }

    const items: ItemStat[] = [];
    for (const [name, agg] of itemAgg) {
      const runsWithItem = agg.runsSet.size;
      items.push({
        name,
        count: agg.count,
        runsWithItem,
        dropRate: totalRuns > 0 ? (runsWithItem / totalRuns) * 100 : 0,
        avgPerDrop: runsWithItem > 0 ? agg.count / runsWithItem : 0,
      });
    }
    items.sort((a, b) => b.dropRate - a.dropRate);

    mapStats.push({ map: mapName, totalRuns, runsWithDrops, items });
  }

  // Total unknown across all runs
  const totalUnknown = runs.reduce((s, r) => s + (r.unknown_count || 0), 0);

  function itemImgSrc(name: string): string | null {
    if (templateFiles.has(name)) return `/api/tracker-image/templates/${name}.png`;
    const slug = templateSlug(name);
    if (templateFiles.has(slug))
      return `/api/tracker-image/templates/${slug}.png`;
    return null;
  }

  function mapImgSrc(name: string): string | null {
    if (mapFiles.has(name)) return `/api/tracker-image/maps/${name}.png`;
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <AutoRefresh intervalMs={5000} />
      <h1 className="text-3xl font-bold mb-2">Drop Tracker</h1>
      <p className="text-sm text-gray-400 mb-1">
        Dados coletados automaticamente via{" "}
        <code className="text-xs bg-white/10 px-1 rounded">item_registry.py --watch</code>
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Total de runs: <b>{runs.length}</b> • Slots desconhecidos (total):{" "}
        <b>{totalUnknown}</b>
      </p>

      {mapStats.length === 0 && (
        <div className="text-gray-500 italic p-8 text-center border border-white/10 rounded-lg">
          Nenhum dado registrado ainda. Rode{" "}
          <code className="bg-white/10 px-1 rounded">
            python item_registry.py --watch
          </code>{" "}
          com o jogo aberto.
        </div>
      )}

      {mapStats.map((ms) => {
        const maxQty = ms.items.reduce((m, s) => Math.max(m, s.count), 0);
        const mapImg = mapImgSrc(ms.map);

        return (
          <section
            key={ms.map}
            className="mb-10 rounded-lg border border-white/10 bg-white/[0.03]"
          >
            <div className="p-4 flex flex-wrap items-center gap-4">
              {mapImg && (
                <img
                  src={mapImg}
                  alt={ms.map}
                  className="h-24 rounded border border-white/10 object-contain"
                />
              )}
              <div className="flex-1">
                <h2 className="text-2xl font-semibold">{prettyName(ms.map)}</h2>
                <p className="text-sm text-gray-400">
                  Total de runs: <b>{ms.totalRuns}</b> • Runs com drop:{" "}
                  <b>{ms.runsWithDrops}</b>
                </p>
              </div>
            </div>

            {ms.items.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm italic">
                Nenhum item identificado neste mapa ainda.
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {ms.items.map((s) => {
                  const img = itemImgSrc(s.name);
                  return (
                    <div
                      key={s.name}
                      className="relative w-40 h-40 rounded border border-white/10 bg-black/40 overflow-hidden"
                      title={`${prettyName(s.name)} — ${s.dropRate.toFixed(1)}%`}
                    >
                      {img ? (
                        <img
                          src={img}
                          alt={s.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                          ?
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-xs text-white py-0.5">
                        {s.dropRate.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Recent runs timeline */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold mb-4">Últimas Runs</h2>
        <div className="space-y-3">
          {[...runs]
            .reverse()
            .slice(0, 20)
            .map((run, i) => (
              <div
                key={`${run.ts}-${i}`}
                className="p-3 rounded-lg border border-white/10 bg-white/3 flex flex-wrap items-center gap-3"
              >
                <div className="text-xs text-gray-400 w-40" suppressHydrationWarning>
                  {formatDate(run.ts)}
                </div>
                <div className="text-sm font-medium text-blue-300">
                  {prettyName(run.map)}
                </div>
                <div className="flex flex-wrap gap-2 flex-1">
                  {run.drops.length === 0 ? (
                    <span className="text-xs text-gray-500 italic">
                      Nenhum drop identificado
                    </span>
                  ) : (
                    run.drops.map((d, j) => {
                      const img = itemImgSrc(d.name);
                      return (
                        <div
                          key={`${d.name}-${j}`}
                          className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded text-xs"
                          title={`${d.name} (score: ${d.score.toFixed(3)})`}
                        >
                          {img && (
                            <img
                              src={img}
                              alt={d.name}
                              className="w-10 h-10 rounded object-contain"
                            />
                          )}
                          <span>{prettyName(d.name)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
                {run.unknown_count > 0 && (
                  <span className="text-xs text-gray-500">
                    +{run.unknown_count} desconhecidos
                  </span>
                )}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
