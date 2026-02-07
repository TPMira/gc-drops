'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/app/components/ToastProvider';

type MapItem = { id: string; name: string; rarity?: string; imageUrl?: string };
type MapType = { id: string; name: string; imageUrl?: string; items: MapItem[] };
type Character = { id: string; name: string };
type ItemFound = { itemId: string; qty: number };
type Run = { mapId: string; itemsFound?: ItemFound[] };

type Status = 'idle' | 'saving' | 'saved' | 'error';

const rarityColor: Record<string, string> = {
  Common: 'bg-gray-600/50 text-gray-200 border-gray-500/30',
  Uncommon: 'bg-green-600/30 text-green-300 border-green-500/30',
  Rare: 'bg-blue-600/30 text-blue-300 border-blue-500/30',
  Epic: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Legendary: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Mythic: 'bg-rose-600/30 text-rose-300 border-rose-500/30',
  Ancestral: 'bg-orange-500/30 text-orange-300 border-orange-500/30',
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
  const [runsData, setRunsData] = useState<Run[]>([]);

  const selectedMap = maps.find((m) => m.id === mapId);

  // Busca runs do servidor
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs');
      const data = await res.json();
      if (data?.runs) {
        setRunsData(data.runs);
      }
    } catch (err) {
      console.error('Erro ao buscar runs:', err);
    }
  }, []);

  // Carrega runs na montagem
  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    const m = maps.find((mm: MapType) => mm.id === mapId);
    setMapItems(m?.items ?? []);
    setItemsFound({});
  }, [mapId, maps]);

  // Estatísticas de drop por item do mapa atual
  const itemDropStats = useMemo(() => {
    const mapRuns = runsData.filter((r) => r.mapId === mapId);
    const totalRuns = mapRuns.length || 1;
    const stats: Record<string, number> = {};
    for (const item of mapItems) {
      let runsWithItem = 0;
      for (const run of mapRuns) {
        const found = run.itemsFound?.find((it) => it.itemId === item.id);
        if (found && Number(found.qty) > 0) runsWithItem++;
      }
      stats[item.id] = (runsWithItem / totalRuns) * 100;
    }
    return stats;
  }, [mapId, mapItems, runsData]);

  // Total de runs do mapa
  const totalMapRuns = useMemo(() => {
    return runsData.filter((r) => r.mapId === mapId).length;
  }, [runsData, mapId]);

  // Ordena por drop rate
  const sortedItems = useMemo(() => {
    return [...mapItems].sort(
      (a, b) => (itemDropStats[b.id] ?? 0) - (itemDropStats[a.id] ?? 0)
    );
  }, [mapItems, itemDropStats]);

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

  function clearSelection() {
    setItemsFound({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCharacterId) {
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
        notify('Run salva com sucesso!', 'success');
        await fetchRuns();
        setTimeout(() => setStatus('idle'), 800);
      } else {
        setStatus('error');
        notify(data?.error ?? 'Erro desconhecido.', 'error');
        setTimeout(() => setStatus('idle'), 2000);
      }
    } catch (err: any) {
      setStatus('error');
      notify(String(err?.message ?? err), 'error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  const totalItems = Object.values(itemsFound).reduce((a, b) => a + b, 0);
  const selectedCount = Object.keys(itemsFound).length;

  function handleItemClick(itemId: string, e: React.MouseEvent) {
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
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            🎮 Registrar Run
          </h1>
          <p className="text-base text-gray-400 mt-2">
            Clique nos itens que droparam. Shift+clique para remover.
          </p>
        </div>
        <Link
          href="/admin/maps"
          className="text-base text-blue-400 hover:text-blue-300 transition flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 hover:bg-blue-500/10"
        >
          ⚙️ Gerenciar Mapas
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Sidebar - Seleção de Mapa */}
          <div className="lg:col-span-1 space-y-6">
            {/* Card do Mapa Selecionado */}
            <div className="p-6 rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-white/2">
              <label className="block text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                Mapa
              </label>
              <select
                value={mapId}
                onChange={(e) => setMapId(e.target.value)}
                className="w-full px-2 py-4 rounded-xl bg-black/40 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-base"
              >
                {maps.map((m: MapType) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              {/* Info do mapa */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-base">
                  <span className="text-gray-400">Total de Runs</span>
                  <span className="font-bold text-white text-lg">{totalMapRuns}</span>
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="text-gray-400">Itens no Mapa</span>
                  <span className="font-bold text-white text-lg">{mapItems.length}</span>
                </div>
              </div>
            </div>

            {/* Card de Seleção */}
            <div className="p-6 rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-white/2">
              <label className="block text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                Seleção Atual
              </label>
              
              {selectedCount > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-bold text-white">{selectedCount}</span>
                    <span className="text-base text-gray-400">item(ns)</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="text-gray-400">Quantidade total</span>
                    <span className="font-bold text-blue-400 text-xl">{totalItems}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-base text-gray-300 transition"
                  >
                    🗑️ Limpar Seleção
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500 text-base">
                  Nenhum item selecionado
                </div>
              )}
            </div>

            {/* Botão Salvar */}
            <button
              type="submit"
              disabled={status === 'saving'}
              className={`w-full px-6 py-4 rounded-2xl font-bold text-lg text-white transition flex items-center justify-center gap-3 ${
                status === 'saved'
                  ? 'bg-green-600'
                  : status === 'error'
                  ? 'bg-red-600'
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-60`}
            >
              {status === 'saving' && (
                <svg className="animate-spin size-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {status === 'saving' ? 'Salvando...' : status === 'saved' ? '✓ Salvo!' : status === 'error' ? '✕ Erro' : '💾 Salvar Run'}
            </button>

            <p className="text-sm text-gray-500 text-center">
              {selectedCount === 0
                ? 'Salvar sem itens = run sem drops'
                : 'Pronto para salvar!'}
            </p>
          </div>

          {/* Main Content - Itens */}
          <div className="lg:col-span-4">
            <div className="p-8 rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-white/2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  📦 Itens de <span className="text-blue-400">{selectedMap?.name}</span>
                </h2>
                <span className="text-base text-gray-500">
                  Ordenado por drop rate
                </span>
              </div>

              {mapItems.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-lg">Este mapa não tem itens cadastrados.</p>
                  <Link href="/admin/maps" className="text-blue-400 hover:underline text-base mt-3 inline-block">
                    Adicionar itens →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5">
                  {sortedItems.map((item) => {
                    const qty = itemsFound[item.id] ?? 0;
                    const checked = qty > 0;
                    const imgSrc = item.imageUrl || `/items/${item.id}.png`;
                    const pct = itemDropStats[item.id] ?? 0;
                    const rarityClass = rarityColor[item.rarity || 'Common'] || rarityColor.Common;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={(e) => handleItemClick(item.id, e)}
                        className={`group relative p-4 rounded-2xl border transition-all duration-200 text-left ${
                          checked
                            ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/50'
                            : 'border-white/10 bg-white/2 hover:bg-white/5 hover:border-white/20'
                        }`}
                        title={`${item.name} • ${pct.toFixed(1)}% drop rate`}
                      >
                        {/* Badge quantidade */}
                        {checked && (
                          <span className="absolute -top-3 -right-3 z-10 min-w-7 h-7 px-2 flex items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold shadow-lg">
                            {qty}
                          </span>
                        )}

                        {/* Imagem */}
                        <div className="relative w-full aspect-square mb-3 flex items-center justify-center">
                          {item.imageUrl ? (
                            <img
                              src={imgSrc}
                              alt={item.name}
                              className={`w-full h-full rounded-xl object-contain transition ${
                                checked ? '' : 'opacity-80 group-hover:opacity-100'
                              }`}
                              onError={(e) => {
                                (e.currentTarget as any).style.visibility = 'hidden';
                              }}
                            />
                          ) : (
                            <Image
                              src={imgSrc}
                              alt={item.name}
                              width={120}
                              height={120}
                              className={`rounded-xl object-contain transition ${
                                checked ? '' : 'opacity-80 group-hover:opacity-100'
                              }`}
                              onError={(e) => {
                                (e.currentTarget as any).style.visibility = 'hidden';
                              }}
                            />
                          )}
                        </div>

                        {/* Nome do item */}
                        <p className="text-sm font-medium text-white truncate mb-2">
                          {item.name}
                        </p>

                        {/* Badges */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs px-2 py-1 rounded-lg border ${rarityClass}`}>
                            {item.rarity || 'Common'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-lg font-mono font-bold ${
                            pct >= 50 ? 'bg-green-500/20 text-green-300' :
                            pct >= 20 ? 'bg-yellow-500/20 text-yellow-300' :
                            pct >= 5 ? 'bg-orange-500/20 text-orange-300' :
                            'bg-red-500/20 text-red-300'
                          }`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}