import { useState, useRef, useCallback, useEffect } from 'react';
import type { AnimationState, HydratedZone } from '../store/persistence';
import { AnimationPreview } from './AnimationPreview';

export interface ZoneData {
  image: HTMLImageElement;
  dataUrl: string;
  columns: number;
  rows: number;
  fps: number;
}

interface Props {
  state: AnimationState;
  label: string;
  initial?: HydratedZone;
  onApply: (data: ZoneData) => void;
  onRemove: () => void;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function SpriteZone({ label, initial, onApply, onRemove }: Props) {
  const [zone, setZone] = useState<ZoneData | null>(
    initial ? { ...initial } : null,
  );
  const [columns, setColumns] = useState(initial?.columns ?? 4);
  const [rows,    setRows]    = useState(initial?.rows    ?? 1);
  const [fps,     setFps]     = useState(initial?.fps     ?? 8);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync initial prop on first load from persistence.
  useEffect(() => {
    if (initial && !zone) {
      setZone({ ...initial });
      setColumns(initial.columns);
      setRows(initial.rows);
      setFps(initial.fps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        const image = await loadImage(dataUrl);
        setZone({ image, dataUrl, columns, rows, fps });
      } catch {
        // ignore corrupt files
      }
    };
    reader.readAsDataURL(file);
  }, [columns, rows, fps]);

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

  const handleApply = () => {
    if (!zone) return;
    onApply({ ...zone, columns, rows, fps });
  };

  const handleRemove = () => {
    setZone(null);
    onRemove();
  };

  const previewKey = zone ? `${zone.dataUrl.slice(-20)}-${columns}-${rows}-${fps}` : '';

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
        {label}
      </div>

      {!zone ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`
            flex items-center justify-center h-20 rounded-lg border-2 border-dashed
            cursor-pointer text-xs text-gray-400 select-none transition-colors
            ${dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
          `}
        >
          Drop or click to load
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {/* Live preview */}
            <div
              className="rounded overflow-hidden bg-gray-100 flex items-center justify-center shrink-0"
              style={{ minWidth: 60, minHeight: 60, maxWidth: 100, maxHeight: 80 }}
            >
              <AnimationPreview
                key={previewKey}
                image={zone.image}
                columns={columns}
                rows={rows}
                fps={fps}
              />
            </div>

            {/* Config */}
            <div className="flex flex-col gap-1 text-xs text-gray-600 min-w-0">
              <label className="flex items-center gap-1">
                <span className="w-14 shrink-0">Cols</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={columns}
                  onChange={(e) => setColumns(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-1.5 py-0.5 border border-gray-200 rounded text-right focus:outline-none focus:border-gray-400"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-14 shrink-0">Rows</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-1.5 py-0.5 border border-gray-200 rounded text-right focus:outline-none focus:border-gray-400"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-14 shrink-0">FPS</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={fps}
                  onChange={(e) => setFps(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-1.5 py-0.5 border border-gray-200 rounded text-right focus:outline-none focus:border-gray-400"
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="flex-1 py-1.5 text-xs font-medium rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleRemove}
              className="px-3 py-1.5 text-xs text-gray-400 rounded border border-gray-200 hover:border-gray-300 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
