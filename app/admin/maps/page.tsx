'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/app/components/ToastProvider';

type MapItem = { id: string; name: string; rarity?: string; imageUrl?: string };
type MapType = { id: string; name: string; imageUrl?: string; items: MapItem[] };

const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancestral'];

const rarityColor: Record<string, string> = {
  Common: 'bg-gray-700 text-gray-100',
  Uncommon: 'bg-green-700 text-green-50',
  Rare: 'bg-blue-700 text-blue-50',
  Epic: 'bg-yellow-500/20 text-yellow-300',
  Legendary: 'bg-purple-500/20 text-purple-300',
  Mythic: 'bg-rose-700 text-rose-50',
  Ancestral: 'bg-orange-600 text-orange-50',
};

export default function AdminMapsPage() {
  const { notify } = useToast();
  const [maps, setMaps] = useState<MapType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  // Forms state
  const [newMapName, setNewMapName] = useState('');
  const [newMapImage, setNewMapImage] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemRarity, setNewItemRarity] = useState('Rare');
  const [newItemImage, setNewItemImage] = useState('');
  
  // Edit states
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editMapName, setEditMapName] = useState('');
  const [editMapImage, setEditMapImage] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemRarity, setEditItemRarity] = useState('');
  const [editItemImage, setEditItemImage] = useState('');

  const fetchMaps = useCallback(async () => {
    try {
      const res = await fetch('/api/maps');
      const data = await res.json();
      if (data?.maps) {
        setMaps(data.maps);
        if (!selectedMapId && data.maps.length > 0) {
          setSelectedMapId(data.maps[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar mapas:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMapId]);

  useEffect(() => {
    fetchMaps();
  }, [fetchMaps]);

  const selectedMap = maps.find((m) => m.id === selectedMapId);

  // ============ MAP ACTIONS ============
  async function handleCreateMap(e: React.FormEvent) {
    e.preventDefault();
    if (!newMapName.trim()) return;

    try {
      const res = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMapName, imageUrl: newMapImage || undefined }),
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Mapa criado com sucesso!', 'success');
        setNewMapName('');
        setNewMapImage('');
        setSelectedMapId(data.map.id);
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao criar mapa', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function handleUpdateMap(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMapId) return;

    try {
      const res = await fetch('/api/maps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingMapId, name: editMapName, imageUrl: editMapImage }),
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Mapa atualizado!', 'success');
        setEditingMapId(null);
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao atualizar mapa', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (!confirm('Tem certeza que deseja excluir este mapa e todos seus itens?')) return;

    try {
      const res = await fetch(`/api/maps?id=${mapId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data?.ok) {
        notify('Mapa excluído!', 'success');
        if (selectedMapId === mapId) {
          setSelectedMapId(maps.find((m) => m.id !== mapId)?.id || null);
        }
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao excluir mapa', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  // ============ ITEM ACTIONS ============
  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMapId || !newItemName.trim()) return;

    try {
      const res = await fetch('/api/maps/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapId: selectedMapId,
          name: newItemName,
          rarity: newItemRarity,
          imageUrl: newItemImage || undefined,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Item criado com sucesso!', 'success');
        setNewItemName('');
        setNewItemImage('');
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao criar item', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function handleUpdateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMapId || !editingItemId) return;

    try {
      const res = await fetch('/api/maps/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapId: selectedMapId,
          itemId: editingItemId,
          name: editItemName,
          rarity: editItemRarity,
          imageUrl: editItemImage,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Item atualizado!', 'success');
        setEditingItemId(null);
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao atualizar item', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!selectedMapId || !confirm('Tem certeza que deseja excluir este item?')) return;

    try {
      const res = await fetch(`/api/maps/items?mapId=${selectedMapId}&itemId=${itemId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Item excluído!', 'success');
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao excluir item', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

  function startEditMap(map: MapType) {
    setEditingMapId(map.id);
    setEditMapName(map.name);
    setEditMapImage(map.imageUrl || '');
  }

  function startEditItem(item: MapItem) {
    setEditingItemId(item.id);
    setEditItemName(item.name);
    setEditItemRarity(item.rarity || 'Rare');
    setEditItemImage(item.imageUrl || '');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="max-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🗺️ Gerenciar Mapas & Itens</h1>
        <Link href="/runs/new" className="text-sm text-blue-400 hover:underline">
          ← Voltar para Runs
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Mapas */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Mapas</h2>

          {/* Form novo mapa */}
          <form onSubmit={handleCreateMap} className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
            <h3 className="text-sm font-medium text-gray-400">Novo Mapa</h3>
            <input
              type="text"
              placeholder="Nome do mapa"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
            />
            <input
              type="text"
              placeholder="URL da imagem (opcional)"
              value={newMapImage}
              onChange={(e) => setNewMapImage(e.target.value)}
              className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
            />
            <button
              type="submit"
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
            >
              + Criar Mapa
            </button>
          </form>

          {/* Lista de mapas */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {maps.map((map) => (
              <div
                key={map.id}
                className={`p-3 rounded-lg border cursor-pointer transition ${
                  selectedMapId === map.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
                onClick={() => setSelectedMapId(map.id)}
              >
                {editingMapId === map.id ? (
                  <form onSubmit={handleUpdateMap} className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editMapName}
                      onChange={(e) => setEditMapName(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-sm"
                    />
                    <input
                      type="text"
                      value={editMapImage}
                      onChange={(e) => setEditMapImage(e.target.value)}
                      placeholder="URL da imagem"
                      className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="px-2 py-1 bg-green-600 rounded text-xs">
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMapId(null)}
                        className="px-2 py-1 bg-gray-600 rounded text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {map.imageUrl && (
                        <Image
                          src={map.imageUrl}
                          alt={map.name}
                          width={32}
                          height={32}
                          className="rounded object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">{map.name}</div>
                        <div className="text-xs text-gray-500">{map.items.length} itens</div>
                      </div>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => startEditMap(map)}
                        className="p-1 hover:bg-white/10 rounded text-xs"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteMap(map.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-xs"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 2-3: Itens do mapa selecionado */}
        <div className="lg:col-span-2 space-y-4">
          {selectedMap ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Itens de: <span className="text-blue-400">{selectedMap.name}</span>
                </h2>
                <span className="text-sm text-gray-500">{selectedMap.items.length} itens</span>
              </div>

              {/* Form novo item */}
              <form
                onSubmit={handleCreateItem}
                className="p-4 rounded-lg border border-white/10 bg-white/5 grid sm:grid-cols-4 gap-3"
              >
                <input
                  type="text"
                  placeholder="Nome do item"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
                />
                <select
                  value={newItemRarity}
                  onChange={(e) => setNewItemRarity(e.target.value)}
                  className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
                >
                  {rarityOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="URL da imagem (opcional)"
                  value={newItemImage}
                  onChange={(e) => setNewItemImage(e.target.value)}
                  className="px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                >
                  + Adicionar Item
                </button>
              </form>

              {/* Lista de itens */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                {selectedMap.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-white/10 bg-white/5"
                  >
                    {editingItemId === item.id ? (
                      <form onSubmit={handleUpdateItem} className="space-y-2">
                        <input
                          type="text"
                          value={editItemName}
                          onChange={(e) => setEditItemName(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-sm"
                        />
                        <select
                          value={editItemRarity}
                          onChange={(e) => setEditItemRarity(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-sm"
                        >
                          {rarityOptions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editItemImage}
                          onChange={(e) => setEditItemImage(e.target.value)}
                          placeholder="URL da imagem"
                          className="w-full px-2 py-1 rounded bg-black/40 border border-white/10 text-sm"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="px-2 py-1 bg-green-600 rounded text-xs">
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            className="px-2 py-1 bg-gray-600 rounded text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <Image
                            src={item.imageUrl || `/items/${item.id}.png`}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="rounded object-contain bg-black/20"
                            onError={(e) => {
                              (e.currentTarget as any).style.visibility = 'hidden';
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{item.name}</div>
                          <div
                            className={`text-xs px-2 py-0.5 rounded inline-block mt-1 ${
                              rarityColor[item.rarity || 'Common'] || 'bg-gray-700'
                            }`}
                          >
                            {item.rarity || 'Common'}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => startEditItem(item)}
                            className="p-1 hover:bg-white/10 rounded text-xs"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 hover:bg-red-500/20 rounded text-xs"
                            title="Excluir"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {selectedMap.items.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    Nenhum item cadastrado neste mapa.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Selecione um mapa para ver seus itens
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
