const KEY = 'sim-world-sprite-library-v1';

export type AnimationState = 'idle' | 'walk' | 'jump' | 'run';

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
