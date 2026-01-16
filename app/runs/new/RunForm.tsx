'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import runs from '@/data/runs.json';
import { useToast } from '@/app/components/ToastProvider';

type MapItem = { id: string; name: string; rarity?: string };
type MapType = { id: string; name: string; items: MapItem[] };
type Character = { id: string; name: string };
type ItemFound = { itemId: string; qty: number };

type Status = 'idle' | 'saving' | 'saved' | 'error';

const rarityColor: Record<string, string> = {
  Common: 'bg-gray-700 text-gray-100',
  Uncommon: 'bg-green-700 text-green-50',
  Rare: 'bg-blue-700 text-blue-50',
  Epic: 'bg-yellow-500/20 text-yellow-300',
  Legendary: 'bg-purple-500/20 text-purple-300',
  Mythic: 'bg-rose-700 text-rose-50',
};

export default function RunForm({
  maps,
  characters,
}: {
  maps: MapType[];
  characters: Character[];
}) {
  const { notify } = useToast();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters?.[0]?.id ?? '');
  const [mapId, setMapId] = useState<string>(maps?.[0]?.id ?? '');
  const [mapItems, setMapItems] = useState<MapItem[]>(maps?.[0]?.items ?? []);
  const [itemsFound, setItemsFound] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const m = maps.find((mm: MapType) => mm.id === mapId);
    setMapItems(m?.items ?? []);
    setItemsFound({});
    setQuery('');
  }, [mapId, maps]);

  // Estatísticas de drop por item do mapa atual
  const itemDropStats = useMemo(() => {
    const mapRuns = (runs as any[]).filter((r: any) => r.mapId === mapId);
    const totalRuns = mapRuns.length || 1; // evita divisão por zero
    const stats: Record<string, number> = {};
    for (const item of mapItems) {
      let runsWithItem = 0;
      for (const run of mapRuns) {
        const found = run.itemsFound?.find((it: any) => it.itemId === item.id);
        if (found && Number(found.qty) > 0) runsWithItem++;
      }
      stats[item.id] = (runsWithItem / totalRuns) * 100;
    }
    return stats;
  }, [mapId, mapItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mapItems;
    return mapItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.rarity ? i.rarity.toLowerCase().includes(q) : false)
    );
  }, [mapItems, query]);

  // Ordena em tempo real: maior drop pct -> menor
 const sortedItems = useMemo(() => {
   return [...filteredItems].sort(
     (a, b) => (itemDropStats[b.id] ?? 0) - (itemDropStats[a.id] ?? 0)
   );
 }, [filteredItems, itemDropStats]);

  function toggleItem(itemId: string) {
    setItemsFound((prev) => {
      const copy = { ...prev };
      if (copy[itemId]) delete copy[itemId];
      else copy[itemId] = 1;
      return copy;
    });
  }

  function setQty(itemId: string, qty: number) {
    setItemsFound((prev) => {
      const copy = { ...prev };
      if (qty <= 0 || Number.isNaN(qty)) delete copy[itemId];
      else copy[itemId] = Math.min(9999, Math.max(1, Math.floor(qty)));
      return copy;
    });
  }

  function inc(itemId: string, delta = 1) {
    setItemsFound((prev) => {
      const current = prev[itemId] ?? 0;
      const next = Math.min(9999, Math.max(0, current + delta));
      const copy = { ...prev };
      if (next <= 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  function selectAllVisible() {
    setItemsFound((prev) => {
      const copy = { ...prev };
      for (const it of filteredItems) {
        if (!copy[it.id]) copy[it.id] = 1;
      }
      return copy;
    });
  }

  function clearSelection() {
    setItemsFound({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!selectedCharacterId) {
      setStatus('error');
      setErrorMsg('Selecione um personagem.');
      notify('Selecione um personagem.', 'error');
      return;
    }
    setStatus('saving');

    const itemsPayload: ItemFound[] = Object.entries(itemsFound).map(([itemId, qty]) => ({ itemId, qty }));
    const body = { characterId: selectedCharacterId, mapId, itemsFound: itemsPayload };

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.ok) {
        setStatus('saved');
        setItemsFound({});
        notify('Run salva com sucesso.', 'success');
        setTimeout(() => setStatus('idle'), 800);
      } else {
        setStatus('error');
        const msg = data?.error ?? 'Erro desconhecido.';
        notify(msg, 'error');
      }
    } catch (err: any) {
      setStatus('error');
      const msg = String(err?.message ?? err);
      setErrorMsg(msg);
      notify(msg, 'error');
    }
  }

  const totalItems = Object.values(itemsFound).reduce((a, b) => a + b, 0);

  function handleItemClick(itemId: string, e: React.MouseEvent) {
    // Shift+clique decrementa, clique normal incrementa
    if (e.shiftKey) {
      inc(itemId, -1);
    } else {
      setItemsFound((prev) => {
        const current = prev[itemId] ?? 0;
        const next = current > 0 ? current + 1 : 1;
        return { ...prev, [itemId]: Math.min(9999, next) };
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 rounded-lg border border-white/10 bg-white/5 backdrop-blur">
      <h1 className="text-2xl font-semibold">Registrar Run</h1>

      <div className="grid gap-4">
        {/* <div> */}
          {/* <label className="block text-sm font-medium mb-1">Personagem</label> */}
          {/* Select de personagens (comentado, mantido para possível retorno futuro) */}
          {/*
          <select
            value={selectedCharacterId}
            onChange={(e) => {
              setSelectedCharacterId(e.target.value);
            }}
            className="w-full border rounded px-3 py-2 bg-black/40 border-white/10 focus:border-blue-500 outline-none"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          */}
          {/* Mantém characterId via hidden para envio */}
          {/* <input type="hidden" name="characterId" value={selectedCharacterId} /> */}
          {/* <div className="text-xs text-gray-500">Usando personagem padrão: {characters.find(c => c.id === selectedCharacterId)?.name ?? '—'}</div> */}
        {/* </div> */}

        <div>
          <label className="block text-sm font-medium mb-1">Mapa</label>
          <select
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-black/40 border-white/10 focus:border-blue-500 outline-none"
          >
            {maps.map((m: MapType) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <label className="block text-sm font-medium">Itens do mapa</label>
          <div className="flex items-center gap-2">
            {/* <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome/raridade..."
              className="border rounded px-3 py-1.5 text-sm bg-black/40 border-white/10 focus:border-blue-500 outline-none"
            />
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs px-3 py-1.5 rounded border border-white/10 hover:bg-white/10"
            >
              Selecionar visíveis
            </button> */}
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs px-3 py-1.5 rounded border border-white/10 hover:bg-white/10"
            >
              Limpar
            </button>
          </div>
        </div>

        {mapItems.length === 0 && (
          <div className="text-sm text-gray-500">
            Este mapa não tem itens cadastrados.
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-5">
          {sortedItems.map((item) => {
            const qty = itemsFound[item.id] ?? 0;
            const checked = qty > 0;
            const imgSrc = `/items/${item.id}.png`;
            const pct = itemDropStats[item.id] ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => handleItemClick(item.id, e as any)}
                className="group relative p-0 bg-transparent border-0 outline-none cursor-pointer"
                aria-pressed={checked}
                title={`${item.name} • ${pct.toFixed(0)}%`}
              >
                <span
                  className={`inline-flex items-center justify-center rounded-lg transition relative
                    ${checked ? 'ring-2 ring-blue-500' : 'ring-0'}
                  `}
                >
                  <Image
                    src={imgSrc}
                    alt={item.name}
                    width={104}
                    height={104}
                    className={`rounded-lg object-contain bg-transparent
                      ${checked ? '' : 'opacity-90 group-hover:opacity-100'}
                    `}
                    onError={(e) => {
                      (e.currentTarget as any).style.visibility = 'hidden';
                    }}
                  />

                  {/* Badge de quantidade selecionada (canto superior direito) */}
                  {checked && (
                    <span className="absolute -top-2 -right-2 text-sm px-2 py-0.5 rounded-full bg-black/80 text-white border border-white/10 font-semibold shadow">
                      {qty}
                    </span>
                  )}
                </span>

                {/* Badge percentual no canto inferior direito */}
                <span className="absolute -bottom-2 -right-2 text-sm px-2 py-0.5 rounded bg-black/80 text-white border border-white/10 font-semibold">
                  {pct.toFixed(2)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60 inline-flex items-center gap-2"
        >
          {status === 'saving' && (
            <svg className="animate-spin size-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {status === 'saving' ? 'Salvando...' : 'Salvar'}
        </button>

        <div className="text-sm text-gray-400">
          {totalItems > 0 ? (
            <span>
              {Object.keys(itemsFound).length} item(ns) marcado(s), total: <b>{totalItems}</b>
            </span>
          ) : (
            <span>Nenhum item selecionado. Ao salvar, será registrado como sem drops.</span>
          )}
        </div>
      </div>
    </form>
  );
}