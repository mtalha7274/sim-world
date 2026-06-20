import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import type { World } from '../engine/World';
import type { AnimationState, HydratedSprites, HydratedZone, PersistedGround, PersistedZone } from '../store/persistence';
import {
  loadSprites,
  saveZone,
  removeZone,
  clearAll as clearAllPersisted,
  saveGround,
  loadGround,
  clearGround,
  loadTileMap,
  clearTileMap,
} from '../store/persistence';
import {
  loadPresets, savePresets, newPresetId,
  type SpritePreset,
} from '../store/spriteLibrary';
import { detectSpriteGrid, isGridConfigStale, mergeDetectedGrid } from '../engine/spriteSheet';
import { GroundTileSheet } from '../engine/GroundTileSheet';
import { AnimationPreview } from './AnimationPreview';
import type { AgentStateSnapshot } from '../engine/World';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneData {
  image: HTMLImageElement;
  dataUrl: string;
  columns: number;
  rows: number;
  fps: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

type ZonesMap = Partial<Record<AnimationState, ZoneData>>;

interface Props {
  worldRef:     RefObject<World | null>;
  worldReady:   boolean;
  selectedTile: number | null;
  onTileSelect: (index: number | null) => void;
  agents:       AgentStateSnapshot[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATES: { value: AnimationState; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'walk', label: 'Walk' },
  { value: 'jump', label: 'Jump' },
  { value: 'run',  label: 'Run'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadImageFromUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function zoneFromHydrated(h: HydratedZone): ZoneData {
  const base: ZoneData = { image: h.image, dataUrl: h.dataUrl, columns: h.columns, rows: h.rows, fps: h.fps, marginX: h.marginX, marginY: h.marginY, spacingX: h.spacingX, spacingY: h.spacingY };
  if (isGridConfigStale(h.image, h.columns, h.rows, h.spacingX, h.spacingY, h.marginX, h.marginY)) {
    return { ...base, ...mergeDetectedGrid(base) };
  }
  return base;
}

function zoneToPersisted(z: ZoneData): PersistedZone {
  return { dataUrl: z.dataUrl, columns: z.columns, rows: z.rows, fps: z.fps, marginX: z.marginX, marginY: z.marginY, spacingX: z.spacingX, spacingY: z.spacingY };
}

function frameHint(image: HTMLImageElement, zone: Pick<ZoneData, 'columns' | 'rows'>) {
  const fw = Math.round(image.naturalWidth / zone.columns);
  const fh = Math.round(image.naturalHeight / zone.rows);
  return `${image.naturalWidth}×${image.naturalHeight} → ${zone.columns}×${zone.rows} · ${fw}×${fh}px/frame`;
}

async function hydratePreset(preset: SpritePreset): Promise<ZonesMap> {
  const map: ZonesMap = {};
  for (const [s, pz] of Object.entries(preset.zones) as [AnimationState, PersistedZone][]) {
    try {
      const image = await loadImageFromUrl(pz.dataUrl);
      map[s] = { image, dataUrl: pz.dataUrl, columns: pz.columns, rows: pz.rows, fps: pz.fps, marginX: pz.marginX, marginY: pz.marginY, spacingX: pz.spacingX, spacingY: pz.spacingY };
    } catch { /* skip corrupt */ }
  }
  return map;
}

// ── TileThumbnail ─────────────────────────────────────────────────────────────

interface TileThumbnailProps { tileSheet: GroundTileSheet; tileIndex: number; selected: boolean; onClick: () => void; }

function TileThumbnail({ tileSheet, tileIndex, selected, onClick }: TileThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const SIZE = 80;
    canvas.width = SIZE; canvas.height = SIZE;
    ctx.clearRect(0, 0, SIZE, SIZE);
    tileSheet.drawTile(ctx, tileIndex, 0, 0, SIZE);
  }, [tileSheet, tileIndex]);
  return (
    <button onClick={onClick} className={`block w-full rounded overflow-hidden p-0 transition-all ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : 'ring-1 ring-gray-200 hover:ring-gray-400'}`}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }} />
    </button>
  );
}

// ── ZoneEditor: upload + configure a single animation zone ────────────────────

interface ZoneEditorProps {
  initial?: ZoneData;
  onSave: (zone: ZoneData) => void;
  onRemove?: () => void;
}

function ZoneEditor({ initial, onSave, onRemove }: ZoneEditorProps) {
  const [staged,   setStaged]   = useState<ZoneData | null>(initial ?? null);
  const [columns,  setColumns]  = useState(initial?.columns  ?? 4);
  const [rows,     setRows]     = useState(initial?.rows     ?? 1);
  const [fps,      setFps]      = useState(initial?.fps      ?? 8);
  const [marginX,  setMarginX]  = useState(initial?.marginX);
  const [marginY,  setMarginY]  = useState(initial?.marginY);
  const [spacingX, setSpacingX] = useState(initial?.spacingX);
  const [spacingY, setSpacingY] = useState(initial?.spacingY);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const image    = await loadImageFromUrl(dataUrl);
        const detected = detectSpriteGrid(image);
        const zone: ZoneData = { image, dataUrl, columns: detected.columns, rows: detected.rows, fps: 8, marginX: detected.marginX, marginY: detected.marginY, spacingX: detected.spacingX, spacingY: detected.spacingY };
        setStaged(zone);
        setColumns(detected.columns); setRows(detected.rows); setFps(8);
        setMarginX(detected.marginX); setMarginY(detected.marginY);
        setSpacingX(detected.spacingX); setSpacingY(detected.spacingY);
      } catch { /* skip */ }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = () => {
    if (!staged) return;
    onSave({ ...staged, columns, rows, fps, marginX, marginY, spacingX, spacingY });
  };

  const previewKey = staged ? `${staged.dataUrl.slice(-16)}-${columns}-${rows}-${fps}` : '';

  if (!staged) {
    return (
      <>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
          className={`flex flex-col items-center justify-center gap-1 h-16 rounded border-2 border-dashed cursor-pointer text-[11px] text-gray-400 select-none transition-colors ${dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
        >
          <span>Drop or click to upload</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-gray-50 border border-gray-100 rounded flex items-center justify-center p-2 min-h-[60px]">
        <AnimationPreview key={previewKey} image={staged.image} columns={columns} rows={rows} fps={fps} marginX={marginX} marginY={marginY} spacingX={spacingX} spacingY={spacingY} showGrid={false} />
      </div>
      <p className="text-[10px] text-gray-400 text-center">{frameHint(staged.image, { columns, rows })}</p>
      <div className="grid grid-cols-3 gap-1">
        {([['Col', columns, setColumns, 1, 64], ['Row', rows, setRows, 1, 64], ['FPS', fps, setFps, 1, 60]] as [string, number, (v: number) => void, number, number][]).map(([lbl, val, setter, min, max]) => (
          <label key={lbl} className="flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span>{lbl}</span>
            <input type="number" min={min} max={max} value={val} onChange={e => setter(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))} className="px-1 py-0.5 border border-gray-200 rounded text-right text-[11px] focus:outline-none focus:border-gray-400 bg-white" />
          </label>
        ))}
      </div>
      <div className="flex gap-1">
        <button onClick={handleSave} className="flex-1 py-1 text-[11px] font-semibold rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors">Save to Preset</button>
        <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-[11px] border border-gray-200 rounded text-gray-400 hover:border-gray-400 transition-colors">↑</button>
        {onRemove && <button onClick={onRemove} className="px-2 py-1 text-[11px] border border-gray-200 rounded text-gray-300 hover:border-red-300 hover:text-red-400 transition-colors">✕</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = 'library' | 'assign' | 'ground';

export function SpritePanel({ worldRef, worldReady, selectedTile, onTileSelect, agents }: Props) {
  const [open,    setOpen]    = useState(true);
  const [tab,     setTab]     = useState<Tab>('library');

  // ── Library state ─────────────────────────────────────────────────────────
  const [presets,        setPresets]        = useState<SpritePreset[]>(loadPresets);
  const [newName,        setNewName]        = useState('');
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [expandedState,  setExpandedState]  = useState<AnimationState>('idle');
  const [expandedZones,  setExpandedZones]  = useState<ZonesMap>({});  // hydrated for expanded preset

  // ── Assign state ──────────────────────────────────────────────────────────
  const [selectedCharId, setSelectedCharId] = useState<string>('player');
  // Track which preset id is "applied" per character (visual indicator only).
  const [appliedPreset,  setAppliedPreset]  = useState<Record<string, string>>({});
  const [assignPresetId, setAssignPresetId] = useState<string>('');

  // ── Ground state ──────────────────────────────────────────────────────────
  const [groundTileSheet, setGroundTileSheet] = useState<GroundTileSheet | null>(null);
  const [groundDragging,  setGroundDragging]  = useState(false);
  const groundFileRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);

  // Remove if selected agent is gone.
  useEffect(() => {
    if (selectedCharId !== 'player' && !agents.find(a => a.id === selectedCharId)) {
      setSelectedCharId('player');
    }
  }, [agents, selectedCharId]);

  // Load player sprites and ground on mount.
  useEffect(() => {
    loadSprites().then((loaded: HydratedSprites) => {
      setReady(true);
      if (!worldRef.current) return;
      for (const [s, h] of Object.entries(loaded) as [AnimationState, HydratedZone][]) {
        if (!h) continue;
        const zone = zoneFromHydrated(h);
        worldRef.current.setCharacterAnimation('player', s, zone);
        if (zone.columns !== h.columns || zone.rows !== h.rows || zone.spacingX !== h.spacingX) saveZone(s, zoneToPersisted(zone));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!worldReady) return;
    const pg = loadGround();
    if (pg) {
      loadImageFromUrl(pg.dataUrl).then(img => {
        const sheet = GroundTileSheet.fromImage(img);
        setGroundTileSheet(sheet);
        worldRef.current?.setGroundSheet(img, sheet.grid);
        saveGround({ dataUrl: pg.dataUrl, ...sheet.grid });
      }).catch(() => {});
    }
    const tileData = loadTileMap();
    if (Object.keys(tileData).length > 0) worldRef.current?.loadTileMap(tileData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldReady]);

  // Hydrate zones when a preset is expanded.
  useEffect(() => {
    if (!expandedId) return;
    const preset = presets.find(p => p.id === expandedId);
    if (!preset) return;
    hydratePreset(preset).then(setExpandedZones);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // ── Library: CRUD ─────────────────────────────────────────────────────────

  const handleCreatePreset = () => {
    if (!newName.trim()) return;
    const preset: SpritePreset = { id: newPresetId(), name: newName.trim(), zones: {} };
    const updated = [...presets, preset];
    setPresets(updated);
    savePresets(updated);
    setNewName('');
    setExpandedId(preset.id);
    setExpandedZones({});
    setExpandedState('idle');
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated);
    if (expandedId === id) { setExpandedId(null); setExpandedZones({}); }
  };

  const handleSaveZoneToPreset = (presetId: string, state: AnimationState, zone: ZoneData) => {
    const pz = zoneToPersisted(zone);
    const updated = presets.map(p => p.id !== presetId ? p : { ...p, zones: { ...p.zones, [state]: pz } });
    setPresets(updated);
    savePresets(updated);
    setExpandedZones(prev => ({ ...prev, [state]: zone }));
  };

  const handleRemoveZoneFromPreset = (presetId: string, state: AnimationState) => {
    const updated = presets.map(p => {
      if (p.id !== presetId) return p;
      const zones = { ...p.zones };
      delete zones[state];
      return { ...p, zones };
    });
    setPresets(updated);
    savePresets(updated);
    setExpandedZones(prev => { const n = { ...prev }; delete n[state]; return n; });
  };

  const handleRenamePreset = (id: string, name: string) => {
    const updated = presets.map(p => p.id === id ? { ...p, name } : p);
    setPresets(updated);
    savePresets(updated);
  };

  // ── Assign ────────────────────────────────────────────────────────────────

  const handleApplyPreset = async () => {
    const preset = presets.find(p => p.id === assignPresetId);
    if (!preset) return;
    const world = worldRef.current;
    if (!world) return;
    world.clearAllCharacterAnimations(selectedCharId);
    const zones = await hydratePreset(preset);
    for (const [s, z] of Object.entries(zones) as [AnimationState, ZoneData][]) {
      world.setCharacterAnimation(selectedCharId, s, z);
      if (selectedCharId === 'player') saveZone(s, zoneToPersisted(z));
    }
    setAppliedPreset(prev => ({ ...prev, [selectedCharId]: preset.id }));
  };

  const handleClearCharacter = () => {
    worldRef.current?.clearAllCharacterAnimations(selectedCharId);
    if (selectedCharId === 'player') {
      clearAllPersisted();
    }
    setAppliedPreset(prev => { const n = { ...prev }; delete n[selectedCharId]; return n; });
  };

  // ── Ground ────────────────────────────────────────────────────────────────

  const loadGroundFile = useCallback(async (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const img   = await loadImageFromUrl(dataUrl);
        const sheet = GroundTileSheet.fromImage(img);
        setGroundTileSheet(sheet);
        worldRef.current?.setGroundSheet(img, sheet.grid);
        saveGround({ dataUrl, ...sheet.grid });
      } catch { /* skip */ }
    };
    reader.readAsDataURL(file);
  }, [worldRef]);

  const PANEL_W = 296;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-14 bg-white border border-gray-200 rounded-l-md text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-all duration-200"
        style={{ right: open ? PANEL_W : 0 }}
        title={open ? 'Close panel' : 'Open panel'}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>{open ? '›' : '‹'}</span>
      </button>

      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 flex flex-col z-40 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: PANEL_W }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-gray-700">World Editor</span>
          <div className="flex gap-1">
            {(['library', 'assign', 'ground'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-2 py-1 text-[11px] rounded transition-all capitalize ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{t}</button>
            ))}
          </div>
        </div>

        {/* ── Library tab ──────────────────────────────────────────────── */}
        {tab === 'library' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            <p className="text-[10px] text-gray-400 leading-snug">Create named presets here — each preset holds sprite sheets for any animation state. Then assign them to characters in the Assign tab.</p>

            {/* New preset */}
            <div className="flex gap-1">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreatePreset(); }}
                placeholder="Preset name…"
                className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400"
              />
              <button
                onClick={handleCreatePreset}
                disabled={!newName.trim()}
                className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                + New
              </button>
            </div>

            {presets.length === 0 && (
              <p className="text-[11px] text-gray-400 text-center pt-2">No presets yet. Enter a name above and click + New.</p>
            )}

            {/* Preset list */}
            {presets.map(preset => {
              const isExpanded = expandedId === preset.id;
              const stateCount = Object.keys(preset.zones).length;
              return (
                <div key={preset.id} className="border border-gray-100 rounded-lg overflow-hidden">
                  {/* Preset header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => { setExpandedId(isExpanded ? null : preset.id); if (!isExpanded) { setExpandedZones({}); setExpandedState('idle'); } }}
                  >
                    <span className="text-[11px] text-gray-500 w-3">{isExpanded ? '▾' : '▸'}</span>
                    <span className="text-xs text-gray-700 flex-1 truncate">{preset.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{stateCount} state{stateCount !== 1 ? 's' : ''}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeletePreset(preset.id); }}
                      className="text-gray-300 hover:text-red-400 text-sm transition-colors ml-1 leading-none"
                    >✕</button>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 pt-2">
                      {/* Rename */}
                      <input
                        type="text"
                        defaultValue={preset.name}
                        onBlur={e => handleRenamePreset(preset.id, e.target.value.trim() || preset.name)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white w-full"
                        placeholder="Preset name"
                      />

                      {/* State tabs */}
                      <div className="flex gap-1">
                        {STATES.map(({ value, label }) => {
                          const hasZone = Boolean(preset.zones[value]);
                          return (
                            <button
                              key={value}
                              onClick={() => setExpandedState(value)}
                              className={`flex-1 py-1 text-[10px] rounded border transition-all flex flex-col items-center gap-0.5 ${expandedState === value ? 'bg-white border-gray-300 text-gray-800 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                              {label}
                              <span className={`w-1 h-1 rounded-full ${hasZone ? 'bg-green-500' : 'bg-gray-200'}`} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Zone editor for active state */}
                      <ZoneEditor
                        key={`${preset.id}-${expandedState}`}
                        initial={expandedZones[expandedState]}
                        onSave={zone => handleSaveZoneToPreset(preset.id, expandedState, zone)}
                        onRemove={preset.zones[expandedState] ? () => handleRemoveZoneFromPreset(preset.id, expandedState) : undefined}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Assign tab ───────────────────────────────────────────────── */}
        {tab === 'assign' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
            <p className="text-[10px] text-gray-400 leading-snug">Pick a character and apply a preset to give them animations. Each character gets their own independent assignment.</p>

            {/* Character selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Character</span>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setSelectedCharId('player')}
                  className={`px-2 py-1 text-xs rounded-md border transition-all ${selectedCharId === 'player' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}
                >
                  Player
                </button>
                {agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedCharId(a.id)}
                    className={`px-2 py-1 text-xs rounded-md border transition-all flex items-center gap-1 ${selectedCharId === a.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
                    {a.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Preset picker */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Preset</span>
              {presets.length === 0 ? (
                <p className="text-[11px] text-gray-400">No presets yet. Create some in the Library tab first.</p>
              ) : (
                <>
                  <select
                    value={assignPresetId}
                    onChange={e => setAssignPresetId(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white"
                  >
                    <option value="">— select a preset —</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({Object.keys(p.zones).length} states)</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={handleApplyPreset}
                      disabled={!assignPresetId || !ready}
                      className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearCharacter}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Applied assignments summary */}
            {Object.keys(appliedPreset).length > 0 && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
                <span className="text-[10px] uppercase tracking-widest text-gray-400">Applied</span>
                {Object.entries(appliedPreset).map(([charId, presetId]) => {
                  const presetName = presets.find(p => p.id === presetId)?.name ?? '(deleted)';
                  const charName = charId === 'player' ? 'Player' : (agents.find(a => a.id === charId)?.name ?? '(removed)');
                  const charColor = charId === 'player' ? undefined : agents.find(a => a.id === charId)?.color;
                  return (
                    <div key={charId} className="flex items-center gap-2 text-xs">
                      {charColor ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: charColor }} /> : <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />}
                      <span className="text-gray-600 flex-1">{charName}</span>
                      <span className="text-gray-400 text-[10px]">{presetName}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Ground tab ───────────────────────────────────────────────── */}
        {tab === 'ground' && (
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            <p className="text-[10px] text-gray-400 leading-snug">Upload a tile sheet to paint the ground. Select a tile then click or drag on the canvas to paint.</p>

            {!groundTileSheet ? (
              <div
                onClick={() => groundFileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setGroundDragging(true); }}
                onDragLeave={() => setGroundDragging(false)}
                onDrop={e => { e.preventDefault(); setGroundDragging(false); const f = e.dataTransfer.files[0]; if (f) loadGroundFile(f); }}
                className={`flex flex-col items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed cursor-pointer text-xs text-gray-400 select-none transition-colors ${groundDragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Drop tile sheet or click</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">{groundTileSheet.columns}×{groundTileSheet.rows} tiles</span>
                  <div className="flex gap-2">
                    <button onClick={() => { worldRef.current?.clearTiles(); clearTileMap(); }} className="text-[10px] text-gray-400 hover:text-red-400 transition-colors">Clear tiles</button>
                    <button onClick={() => { worldRef.current?.setGroundSheet(null); setGroundTileSheet(null); clearGround(); onTileSelect(null); }} className="text-[10px] text-gray-400 hover:text-red-400 transition-colors">Remove sheet</button>
                  </div>
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${groundTileSheet.columns}, minmax(0, 1fr))` }}>
                  {Array.from({ length: groundTileSheet.tileCount }, (_, i) => (
                    <TileThumbnail key={i} tileSheet={groundTileSheet} tileIndex={i} selected={selectedTile === i} onClick={() => onTileSelect(selectedTile === i ? null : i)} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onTileSelect(selectedTile === -1 ? null : -1)} className={`flex-1 py-1.5 text-xs rounded-md border transition-all ${selectedTile === -1 ? 'bg-red-50 border-red-300 text-red-500' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>Erase mode</button>
                </div>
                {selectedTile !== null && (
                  <p className="text-[10px] text-gray-400 text-center">
                    {selectedTile === -1 ? 'Click cells to erase' : 'Click or drag cells to paint · right-click to erase'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            WASD / arrows · <strong className="text-gray-500">Shift</strong> run · <strong className="text-gray-500">Space</strong> jump · <strong className="text-gray-500">E</strong> attack
          </p>
        </div>
      </div>

      <input ref={groundFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadGroundFile(f); e.target.value = ''; }} />
    </>
  );
}
