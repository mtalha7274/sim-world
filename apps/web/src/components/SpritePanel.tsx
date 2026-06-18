import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import type { World } from '../engine/World';
import type { AnimationState, HydratedSprites, HydratedZone, PersistedZone } from '../store/persistence';
import {
  loadSprites,
  saveZone,
  removeZone,
  clearAll as clearAllPersisted,
} from '../store/persistence';
import { detectSpriteGrid, isGridConfigStale, mergeDetectedGrid } from '../engine/spriteSheet';
import { AnimationPreview } from './AnimationPreview';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoneData {
  image: HTMLImageElement;
  dataUrl: string;
  columns: number;
  rows: number;
  fps: number;
  frameWidth?: number;
  frameHeight?: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

type ZonesMap = Partial<Record<AnimationState, ZoneData>>;

interface Props {
  worldRef: RefObject<World | null>;
  worldReady: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATES: { value: AnimationState; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'walk', label: 'Walk' },
  { value: 'jump', label: 'Jump' },
  { value: 'run',  label: 'Run'  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadImageFromUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function zoneFromHydrated(h: HydratedZone): ZoneData {
  const base: ZoneData = {
    image: h.image,
    dataUrl: h.dataUrl,
    columns: h.columns,
    rows: h.rows,
    fps: h.fps,
    marginX: h.marginX,
    marginY: h.marginY,
    spacingX: h.spacingX,
    spacingY: h.spacingY,
  };

  if (isGridConfigStale(h.image, h.columns, h.rows, h.spacingX, h.spacingY, h.marginX, h.marginY)) {
    const detected = mergeDetectedGrid(base);
    return { ...base, ...detected };
  }

  return base;
}

function zoneToPersisted(z: ZoneData): PersistedZone {
  return {
    dataUrl: z.dataUrl,
    columns: z.columns,
    rows: z.rows,
    fps: z.fps,
    marginX: z.marginX,
    marginY: z.marginY,
    spacingX: z.spacingX,
    spacingY: z.spacingY,
  };
}

function frameHint(image: HTMLImageElement, zone: Pick<ZoneData, 'columns' | 'rows'>) {
  const fw = Math.round(image.naturalWidth / zone.columns);
  const fh = Math.round(image.naturalHeight / zone.rows);
  return `${image.naturalWidth}×${image.naturalHeight} → ${zone.columns}×${zone.rows} · ${fw}×${fh}px/frame`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpritePanel({ worldRef, worldReady }: Props) {
  const [open,     setOpen]     = useState(true);
  const [active,   setActive]   = useState<AnimationState>('idle');
  const [zones,    setZones]    = useState<ZonesMap>({});
  const [ready,    setReady]    = useState(false);

  const [staged,   setStaged]   = useState<ZoneData | null>(null);
  const [columns,  setColumns]  = useState(4);
  const [rows,     setRows]     = useState(1);
  const [fps,      setFps]      = useState(8);
  const [marginX,  setMarginX]  = useState<number | undefined>();
  const [marginY,  setMarginY]  = useState<number | undefined>();
  const [spacingX, setSpacingX] = useState<number | undefined>();
  const [spacingY, setSpacingY] = useState<number | undefined>();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyConfigToState = (zone: ZoneData) => {
    setStaged(zone);
    setColumns(zone.columns);
    setRows(zone.rows);
    setFps(zone.fps);
    setMarginX(zone.marginX);
    setMarginY(zone.marginY);
    setSpacingX(zone.spacingX);
    setSpacingY(zone.spacingY);
  };

  const applyZonesToWorld = useCallback((map: ZonesMap) => {
    const world = worldRef.current;
    if (!world) return;
    for (const [s, z] of Object.entries(map) as [AnimationState, ZoneData][]) {
      if (z) world.setAnimation(s, z);
    }
  }, [worldRef]);

  const buildZoneData = (base: Pick<ZoneData, 'image' | 'dataUrl'>): ZoneData => ({
    ...base,
    columns,
    rows,
    fps,
    marginX,
    marginY,
    spacingX,
    spacingY,
  });

  // Load persisted sprites once on mount; re-detect stale grid configs.
  useEffect(() => {
    loadSprites().then((loaded: HydratedSprites) => {
      const map: ZonesMap = {};
      for (const [s, h] of Object.entries(loaded) as [AnimationState, HydratedZone][]) {
        if (!h) continue;
        const zone = zoneFromHydrated(h);
        map[s] = zone;
        if (
          zone.columns !== h.columns ||
          zone.rows !== h.rows ||
          zone.spacingX !== h.spacingX
        ) {
          saveZone(s, zoneToPersisted(zone));
        }
      }
      setZones(map);
      setReady(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply sprites once the game world is ready (avoids child-before-parent effect race).
  useEffect(() => {
    if (!worldReady || !ready || Object.keys(zones).length === 0) return;
    applyZonesToWorld(zones);
  }, [worldReady, ready, zones, applyZonesToWorld]);

  // When the active tab changes, populate staged from the saved zone (if any).
  useEffect(() => {
    const existing = zones[active];
    if (existing) {
      applyConfigToState(existing);
    } else {
      setStaged(null);
      setColumns(4);
      setRows(1);
      setFps(8);
      setMarginX(undefined);
      setMarginY(undefined);
      setSpacingX(undefined);
      setSpacingY(undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ── File loading ────────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const image = await loadImageFromUrl(dataUrl);
        const detected = detectSpriteGrid(image);
        const zone: ZoneData = {
          image,
          dataUrl,
          columns: detected.columns,
          rows: detected.rows,
          fps: 8,
          marginX: detected.marginX,
          marginY: detected.marginY,
          spacingX: detected.spacingX,
          spacingY: detected.spacingY,
        };
        applyConfigToState(zone);
        setZones(z => ({ ...z, [active]: zone }));
        saveZone(active, zoneToPersisted(zone));
      } catch {
        /* skip corrupt files */
      }
    };
    reader.readAsDataURL(file);
  }, [active]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  }, [loadFile]);

  // ── Apply / remove ──────────────────────────────────────────────────────

  const handleApply = () => {
    if (!staged) return;
    const data = buildZoneData(staged);
    worldRef.current?.setAnimation(active, data);
    setZones(z => ({ ...z, [active]: data }));
    saveZone(active, zoneToPersisted(data));
    setStaged(data);
  };

  const handleRemove = () => {
    worldRef.current?.clearAnimation(active);
    setZones(z => { const n = { ...z }; delete n[active]; return n; });
    setStaged(null);
    removeZone(active);
  };

  const handleReset = () => {
    worldRef.current?.clearAllAnimations();
    clearAllPersisted();
    setZones({});
    setStaged(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const previewKey = staged
    ? `${staged.dataUrl.slice(-16)}-${columns}-${rows}-${fps}`
    : '';

  const PANEL_W = 296;

  return (
    <>
      {/* Edge toggle tab */}
      <button
        onClick={() => setOpen(v => !v)}
        className="
          fixed top-1/2 -translate-y-1/2 z-50
          flex items-center justify-center
          w-5 h-14 bg-white border border-gray-200
          rounded-l-md text-gray-400
          hover:text-gray-600 hover:border-gray-300
          shadow-sm transition-all duration-200
        "
        style={{ right: open ? PANEL_W : 0 }}
        title={open ? 'Close panel' : 'Open panel'}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>{open ? '›' : '‹'}</span>
      </button>

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full bg-white border-l border-gray-200
          flex flex-col z-40 transition-transform duration-200
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ width: PANEL_W }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Animations</span>
          <button
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1"
          >
            Reset all
          </button>
        </div>

        {/* State tabs */}
        <div className="px-3 pt-3 pb-1 flex gap-1.5">
          {STATES.map(({ value, label }) => {
            const isActive  = value === active;
            const isApplied = Boolean(zones[value]);
            return (
              <button
                key={value}
                onClick={() => setActive(value)}
                className={`
                  flex-1 py-1.5 text-xs rounded-md border transition-all
                  flex flex-col items-center gap-0.5
                  ${isActive
                    ? 'bg-gray-100 border-gray-300 text-gray-800 font-semibold'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                `}
              >
                {label}
                <span className={`w-1 h-1 rounded-full ${isApplied ? 'bg-green-500' : 'bg-gray-200'}`} />
              </button>
            );
          })}
        </div>

        {/* Main zone area */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!ready ? (
            <div className="text-xs text-gray-400 text-center pt-6">Loading…</div>
          ) : !staged ? (
            /* Drop zone */
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`
                flex flex-col items-center justify-center gap-2
                h-24 rounded-lg border-2 border-dashed cursor-pointer
                text-xs text-gray-400 select-none transition-colors
                ${dragging
                  ? 'border-gray-400 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Drop sprite sheet or click</span>
              <span className="text-gray-300 text-[10px]">PNG · GIF · JPG</span>
            </div>
          ) : (
            /* Loaded — preview + config + actions */
            <div className="flex flex-col gap-3">

              {/* Preview */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center p-3 min-h-[88px]">
                <AnimationPreview
                  key={previewKey}
                  image={staged.image}
                  columns={columns}
                  rows={rows}
                  fps={fps}
                  marginX={marginX}
                  marginY={marginY}
                  spacingX={spacingX}
                  spacingY={spacingY}
                />
              </div>

              <p className="text-[10px] text-gray-400 text-center leading-snug">
                {frameHint(staged.image, { columns, rows })}
              </p>

              {/* Config */}
              <div className="flex flex-col gap-2">
                {([
                  ['Columns', columns, setColumns, 1, 64],
                  ['Rows',    rows,    setRows,    1, 64],
                  ['FPS',     fps,     setFps, 1, 60],
                ] as [string, number, (v: number) => void, number, number][]).map(
                  ([label, value, setter, min, max]) => (
                    <label key={label} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="w-14 shrink-0">{label}</span>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={value}
                        onChange={e => setter(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-right text-xs focus:outline-none focus:border-gray-400 bg-white"
                      />
                    </label>
                  )
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleApply}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={handleRemove}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-400 hover:border-red-300 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Applied summary */}
        {Object.keys(zones).length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-400">Applied</span>
            {STATES.filter(s => zones[s.value]).map(({ value, label }) => {
              const z = zones[value]!;
              return (
                <div key={value} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-gray-600 flex-1">{label}</span>
                  <span className="text-gray-400">{z.columns}×{z.rows} @{z.fps}fps</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            WASD / arrows · <strong className="text-gray-500">Shift</strong> run · <strong className="text-gray-500">Space</strong> jump
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </>
  );
}
