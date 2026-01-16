import fs from "fs";
import path from "path";
import DuoBoard, { type DuoQueue } from "./DuoBoard";

export const dynamic = "force-dynamic";

function readJSON(file: string) {
  const p = path.join(process.cwd(), "data", file);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export default function DuoPage() {
  const initialQueues = (readJSON("duoQueues.json") ?? []) as DuoQueue[];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070b16] text-zinc-100">
      {/* Camada 1: Fundo */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 500px at 15% 15%, rgba(65,130,255,0.22), transparent 60%), radial-gradient(700px 450px at 85% 30%, rgba(255,190,90,0.16), transparent 62%), radial-gradient(900px 700px at 50% 110%, rgba(110,70,255,0.18), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 35%)",
        }}
      />

      {/* Camada 2: Overlay */}
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
              <h1 className="text-3xl font-bold">Encontrar Duo</h1>
              <p className="text-sm text-gray-300 mt-1">
                Encontre filas abertas por mapa e role. Ex: <b>Duo Calnat</b>.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-300">
              <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-400/20 text-blue-200">
                Duo queue
              </span>
            </div>
          </div>
        </div>

        <DuoBoard initialQueues={initialQueues} />
      </div>
    </div>
  );
}
