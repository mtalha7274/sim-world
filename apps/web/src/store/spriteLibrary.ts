const KEY = 'sim-world-sprite-library-v1';

export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'attack';

export interface PersistedZone {
  dataUrl: string;
  columns: number;
  rows: number;
  fps: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

export interface SpritePreset {
  id: string;
  name: string;
  zones: Partial<Record<AnimationState, PersistedZone>>;
}

export function loadPresets(): SpritePreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SpritePreset[]) : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: SpritePreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    // localStorage full
  }
}

let _nextId = Date.now();
export function newPresetId(): string { return `preset-${_nextId++}`; }

export interface HydratedZone extends PersistedZone {
  image: HTMLImageElement;
}
export type HydratedZonesMap = Partial<Record<AnimationState, HydratedZone>>;

export async function hydratePreset(preset: SpritePreset): Promise<HydratedZonesMap> {
  const map: HydratedZonesMap = {};
  for (const [s, pz] of Object.entries(preset.zones) as [AnimationState, PersistedZone][]) {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = pz.dataUrl;
      });
      map[s] = { ...pz, image };
    } catch { /* skip corrupt */ }
  }
  return map;
}
