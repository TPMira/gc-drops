"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttackRankStats } from "@/lib/attackRank";

type FormState = {
  name: string;
  character: string;
  attack: string;
  critChancePct: string;
  critDamagePct: string;
  specialAttack: string;
  backAttackDamagePct: string;
};

function toNumberString(v: string) {
  // aceita "117,52" também
  return v.replace(",", ".").trim();
}

export default function AttackRankCreate() {
  return <AttackRankCreateWithEndpoint />;
}

export function AttackRankCreateWithEndpoint({
  endpoint = "/api/attack-rank",
  title = "Cadastrar novo attack",
  subtitle = "Adiciona uma nova entrada no rank.",
  buttonLabel = "Cadastrar",
}: {
  endpoint?: string;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: "",
    character: "",
    attack: "",
    critChancePct: "",
    critDamagePct: "",
    specialAttack: "",
    backAttackDamagePct: "",
  });

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    const atk = Number(toNumberString(form.attack));
    return Number.isFinite(atk) && atk > 0;
  }, [form.attack, form.name]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setError(null);
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError("Preencha Name e Atk (Atk > 0).");
      return;
    }

    const stats: AttackRankStats = {
      attack: Number(toNumberString(form.attack)) || 0,
      critChancePct: Number(toNumberString(form.critChancePct)) || 0,
      critDamagePct: Number(toNumberString(form.critDamagePct)) || 0,
      specialAttack: Number(toNumberString(form.specialAttack)) || 0,
      backAttackDamagePct: Number(toNumberString(form.backAttackDamagePct)) || 0,
    };

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          character: form.character.trim() || undefined,
          stats,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao cadastrar");
      }

      setForm({
        name: "",
        character: "",
        attack: "",
        critChancePct: "",
        critDamagePct: "",
        specialAttack: "",
        backAttackDamagePct: "",
      });
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-4 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-gray-400">{subtitle}</div>
        </div>
        <button
          type="button"
          className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm hover:bg-black/60"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Fechar" : buttonLabel}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fechar cadastro"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl rounded-lg border border-white/10 bg-[#0b1022]/95 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-white/10">
              <div>
                <div className="font-semibold">{title}</div>
                <div className="text-sm text-gray-400">Camada 4 (modal) por cima da página.</div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm hover:bg-black/60"
                onClick={close}
              >
                Fechar
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="text-gray-300 mb-1">Name</div>
                <input
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Nome do jogador"
                  autoFocus
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Personagem (opcional)</div>
                <input
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.character}
                  onChange={(e) => setForm((s) => ({ ...s, character: e.target.value }))}
                  placeholder="Ex: Ronan"
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Atk</div>
                <input
                  inputMode="numeric"
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.attack}
                  onChange={(e) => setForm((s) => ({ ...s, attack: e.target.value }))}
                  placeholder="41991"
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Crit%</div>
                <input
                  inputMode="decimal"
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.critChancePct}
                  onChange={(e) => setForm((s) => ({ ...s, critChancePct: e.target.value }))}
                  placeholder="117.52"
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Dano Crit%</div>
                <input
                  inputMode="decimal"
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.critDamagePct}
                  onChange={(e) => setForm((s) => ({ ...s, critDamagePct: e.target.value }))}
                  placeholder="968.02"
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Atk Esp</div>
                <input
                  inputMode="numeric"
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.specialAttack}
                  onChange={(e) => setForm((s) => ({ ...s, specialAttack: e.target.value }))}
                  placeholder="25620"
                />
              </label>

              <label className="text-sm">
                <div className="text-gray-300 mb-1">Costas%</div>
                <input
                  inputMode="decimal"
                  className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  value={form.backAttackDamagePct}
                  onChange={(e) => setForm((s) => ({ ...s, backAttackDamagePct: e.target.value }))}
                  placeholder="86.90"
                />
              </label>

              <div className="md:col-span-2 flex items-center justify-between gap-3 mt-2">
                <div className="text-sm text-rose-300">{error || ""}</div>
                <button
                  type="submit"
                  disabled={!canSubmit || loading}
                  className="px-4 py-2 rounded bg-black/60 border border-white/10 text-sm disabled:opacity-50"
                >
                  {loading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
