'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useToast } from '@/app/components/ToastProvider';

type MapItem = { id: string; name: string; rarity?: string; imageUrl?: string };
type MapType = { id: string; name: string; imageUrl?: string; items: MapItem[]; runsOffset?: number; dropOffsets?: Record<string, number> };

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

  // Drag & drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Offset editing state
  const [showOffsets, setShowOffsets] = useState(false);
  const [offsetRuns, setOffsetRuns] = useState('0');
  const [offsetDrops, setOffsetDrops] = useState<Record<string, string>>({});
  // Fields for "add more" (delta on top of saved)
  const [addRuns, setAddRuns] = useState('0');
  const [addDrops, setAddDrops] = useState<Record<string, string>>({});

  // Image picker state
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [publicItems, setPublicItems] = useState<string[]>([]);
  const [imagePickerTab, setImagePickerTab] = useState<'public' | 'existing'>('public');
  const [imageSearch, setImageSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/maps/public-items', { method: 'POST', body: form });
      const data = await res.json();
      if (data?.ok) {
        notify(`"${data.filename}" enviado!`, 'success');
        const r = await fetch('/api/maps/public-items');
        const d = await r.json();
        if (d?.files) setPublicItems(d.files);
        const url = `/items/${data.filename}`;
        setNewItemImage(url);
        setShowImagePicker(false);
      } else {
        notify(data?.error || 'Erro ao enviar', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  // All unique images from other maps not yet used in the selected map
  const suggestedImages = useMemo(() => {
    const currentUrls = new Set(
      (maps.find((m) => m.id === selectedMapId)?.items ?? []).map((i) => i.imageUrl).filter(Boolean)
    );
    const seen = new Set<string>();
    const result: { url: string; name: string }[] = [];
    for (const map of maps) {
      for (const item of map.items) {
        if (item.imageUrl && !seen.has(item.imageUrl) && !currentUrls.has(item.imageUrl)) {
          seen.add(item.imageUrl);
          result.push({ url: item.imageUrl, name: item.name });
        }
      }
    }
    return result;
  }, [maps, selectedMapId]);

  // Files from public/items not yet used in the selected map
  const availablePublicItems = useMemo(() => {
    const usedPaths = new Set(
      (maps.find((m) => m.id === selectedMapId)?.items ?? [])
        .map((i) => i.imageUrl)
        .filter((u) => u?.startsWith('/items/'))
    );
    return publicItems.filter((f) => !usedPaths.has(`/items/${f}`));
  }, [publicItems, maps, selectedMapId]);

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
    fetch('/api/maps/public-items')
      .then((r) => r.json())
      .then((d) => { if (d?.files) setPublicItems(d.files); })
      .catch(() => {});
  }, [fetchMaps]);

  // Sync offset inputs when selected map changes
  useEffect(() => {
    const map = maps.find((m) => m.id === selectedMapId);
    if (map) {
      setOffsetRuns(String(map.runsOffset ?? 0));
      const drops: Record<string, string> = {};
      const addD: Record<string, string> = {};
      for (const item of map.items) {
        drops[item.id] = String(map.dropOffsets?.[item.id] ?? 0);
        addD[item.id] = '0';
      }
      setOffsetDrops(drops);
      setAddDrops(addD);
      setAddRuns('0');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapId]);

  const selectedMap = maps.find((m) => m.id === selectedMapId);

  // ============ DRAG & DROP HANDLERS ============
  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  async function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newMaps = [...maps];
    const [moved] = newMaps.splice(dragIndex, 1);
    newMaps.splice(dropIndex, 0, moved);
    setMaps(newMaps);
    setDragIndex(null);
    setDragOverIndex(null);
    try {
      await fetch('/api/maps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapIds: newMaps.map((m) => m.id) }),
      });
    } catch (err) {
      notify('Erro ao salvar ordem', 'error');
    }
  }

  // ============ OFFSET HANDLER ============
  async function handleSaveOffsets(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMapId) return;

    // Accumulate: new total = current saved + delta entered now
    const newRunsOffset = (parseInt(offsetRuns, 10) || 0) + (parseInt(addRuns, 10) || 0);

    const dropOffsetsData: Record<string, number> = {};
    for (const item of (selectedMap?.items ?? [])) {
      const saved = parseInt(offsetDrops[item.id] ?? '0', 10) || 0;
      const delta = parseInt(addDrops[item.id] ?? '0', 10) || 0;
      dropOffsetsData[item.id] = saved + delta;
    }

    try {
      const res = await fetch('/api/maps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedMapId,
          runsOffset: newRunsOffset,
          dropOffsets: dropOffsetsData,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        notify('Contagens ajustadas!', 'success');
        setAddRuns('0');
        setAddDrops((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, '0'])));
        await fetchMaps();
      } else {
        notify(data?.error || 'Erro ao salvar ajustes', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  }

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
            {maps.map((map, index) => (
              <div
                key={map.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-3 rounded-lg border cursor-pointer transition select-none ${
                  dragOverIndex === index && dragIndex !== index
                    ? 'border-blue-400 bg-blue-400/20 scale-[1.01]'
                    : dragIndex === index
                    ? 'opacity-40 border-white/20 bg-white/5'
                    : selectedMapId === map.id
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
                      <span
                        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing text-lg leading-none"
                        title="Arrastar para reordenar"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        ⠿
                      </span>
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
                className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3"
              >
                <div className="grid sm:grid-cols-4 gap-3">
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
                <div className="relative">
                  <input
                    type="text"
                    placeholder="URL da imagem (opcional)"
                    value={newItemImage}
                    onChange={(e) => setNewItemImage(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                >
                  + Adicionar Item
                </button>
                </div>

                {/* Image suggestions */}
                {(availablePublicItems.length > 0 || suggestedImages.length > 0) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => { setShowImagePicker((v) => !v); setImageSearch(''); }}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      🖼️ {showImagePicker ? 'Ocultar picker' : 'Escolher imagem'}
                      {availablePublicItems.length > 0 && <span className="text-gray-500">({availablePublicItems.length} locais + {suggestedImages.length} de outros mapas)</span>}
                    </button>
                    {showImagePicker && (
                      <div className="mt-2 rounded bg-black/30 border border-white/10 overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-white/10">
                          <button
                            type="button"
                            onClick={() => setImagePickerTab('public')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                              imagePickerTab === 'public' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            📁 /public/items ({availablePublicItems.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setImagePickerTab('existing')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                              imagePickerTab === 'existing' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            🗺️ Outros mapas ({suggestedImages.length})
                          </button>
                        </div>
                        {/* Search + Upload */}
                        <div className="p-2 flex gap-2">
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={imageSearch}
                            onChange={(e) => setImageSearch(e.target.value)}
                            className="flex-1 px-2 py-1 rounded bg-black/40 border border-white/10 text-xs"
                          />
                          {imagePickerTab === 'public' && (
                            <label className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer transition ${
                              uploading ? 'bg-gray-700 text-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}>
                              {uploading ? '⏳' : '⬆️'} {uploading ? 'Enviando...' : 'Upload'}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                disabled={uploading}
                                onChange={handleUpload}
                              />
                            </label>
                          )}
                        </div>
                        {/* Grid */}
                        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-scroll p-2 pt-0">
                          {imagePickerTab === 'public'
                            ? availablePublicItems
                                .filter((f) => f.toLowerCase().includes(imageSearch.toLowerCase()))
                                .map((file) => {
                                  const url = `/items/${file}`;
                                  const label = file.replace(/\.[^.]+$/, '');
                                  return (
                                    <button
                                      key={file}
                                      type="button"
                                      title={label}
                                      onClick={() => { setNewItemImage(url); setShowImagePicker(false); }}
                                      className={`flex flex-col items-center gap-1 p-1 rounded border-2 transition hover:bg-white/10 ${
                                        newItemImage === url ? 'border-blue-400' : 'border-transparent hover:border-white/20'
                                      }`}
                                    >
                                      <Image
                                        src={url}
                                        alt={label}
                                        width={40}
                                        height={40}
                                        className="rounded object-contain bg-black/20"
                                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                                      />
                                      <span className="text-[10px] text-gray-400 max-w-14 truncate leading-tight">{label}</span>
                                    </button>
                                  );
                                })
                            : suggestedImages
                                .filter((img) => img.name.toLowerCase().includes(imageSearch.toLowerCase()))
                                .map((img) => (
                                  <button
                                    key={img.url}
                                    type="button"
                                    title={img.name}
                                    onClick={() => { setNewItemImage(img.url); setShowImagePicker(false); }}
                                    className={`flex flex-col items-center gap-1 p-1 rounded border-2 transition hover:bg-white/10 ${
                                      newItemImage === img.url ? 'border-blue-400' : 'border-transparent hover:border-white/20'
                                    }`}
                                  >
                                    <Image
                                      src={img.url}
                                      alt={img.name}
                                      width={40}
                                      height={40}
                                      className="rounded object-contain bg-black/20"
                                      onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                                    />
                                    <span className="text-[10px] text-gray-400 max-w-14 truncate leading-tight">{img.name}</span>
                                  </button>
                                ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Lista de itens */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-scroll">
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

              {/* Ajuste Manual de Contagem */}
              <div className="mt-6 border border-white/10 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOffsets((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 text-sm font-medium text-gray-300 transition"
                >
                  <span>⚙️ Ajuste Manual de Contagem</span>
                  <span className="text-gray-500">{showOffsets ? '▲' : '▼'}</span>
                </button>
                {showOffsets && (
                  <form onSubmit={handleSaveOffsets} className="p-4 space-y-5 bg-black/20">
                    <p className="text-xs text-gray-500">
                      O total acumulado é somado às contagens reais. Digite apenas o valor <span className="text-white font-medium">adicional novo</span> a cada vez — ele será somado ao total já salvo.
                    </p>

                    {/* Idas */}
                    <div className="space-y-1">
                      <div className="text-sm text-gray-400 font-medium">Idas (offset)</div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-xs text-gray-500 bg-black/30 px-3 py-1.5 rounded border border-white/10">
                          <span>Total salvo:</span>
                          <span className="text-white font-bold">{offsetRuns}</span>
                        </div>
                        <span className="text-gray-600">+</span>
                        <input
                          type="number"
                          value={addRuns}
                          onChange={(e) => setAddRuns(e.target.value)}
                          placeholder="adicionar"
                          className="w-28 px-3 py-1.5 rounded bg-black/40 border border-white/10 text-sm text-center"
                          min={0}
                        />
                        <span className="text-xs text-gray-500">= <span className="text-white font-bold">{(parseInt(offsetRuns, 10) || 0) + (parseInt(addRuns, 10) || 0)}</span></span>
                      </div>
                    </div>

                    {/* Drops por item */}
                    <div className="space-y-2">
                      <div className="text-sm text-gray-400 font-medium">Drops extras por item:</div>
                      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 max-h-48 overflow-y-auto pr-1">
                        {selectedMap.items.map((item) => {
                          const saved = parseInt(offsetDrops[item.id] ?? '0', 10) || 0;
                          const delta = parseInt(addDrops[item.id] ?? '0', 10) || 0;
                          return (
                            <div key={item.id} className="space-y-0.5">
                              <span className="text-xs text-gray-400 truncate block" title={item.name}>{item.name}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-600 bg-black/30 px-2 py-1 rounded border border-white/10 min-w-9 text-center">{saved}</span>
                                <span className="text-gray-600 text-xs">+</span>
                                <input
                                  type="number"
                                  value={addDrops[item.id] ?? '0'}
                                  onChange={(e) =>
                                    setAddDrops((prev) => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  className="w-16 px-2 py-1 rounded bg-black/40 border border-white/10 text-xs text-center"
                                  min={0}
                                />
                                <span className="text-xs text-gray-500">= <span className="text-white">{saved + delta}</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium"
                    >
                      💾 Salvar Ajustes
                    </button>
                  </form>
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
