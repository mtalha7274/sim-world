const KEY = 'sim-world-v1';

export interface PersistedZone {
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

export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'attack';

export type PersistedSprites = Partial<Record<AnimationState, PersistedZone>>;

export interface HydratedZone extends PersistedZone {
  image: HTMLImageElement;
}

export type HydratedSprites = Partial<Record<AnimationState, HydratedZone>>;

function loadRaw(): PersistedSprites {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PersistedSprites) : {};
  } catch {
    return {};
  }
}

function saveRaw(data: PersistedSprites) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage full — silently skip
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function loadSprites(): Promise<HydratedSprites> {
  const raw = loadRaw();
  const result: HydratedSprites = {};

  await Promise.all(
    (Object.entries(raw) as [AnimationState, PersistedZone][]).map(
      async ([state, zone]) => {
        try {
          const image = await loadImage(zone.dataUrl);
          result[state] = { ...zone, image };
        } catch {
          // Corrupt data URL — skip this state.
        }
      },
    ),
  );

  return result;
}

export function saveZone(state: AnimationState, zone: PersistedZone) {
  const existing = loadRaw();
  existing[state] = zone;
  saveRaw(existing);
}

export function removeZone(state: AnimationState) {
  const existing = loadRaw();
  delete existing[state];
  saveRaw(existing);
}

export function clearAll() {
  localStorage.removeItem(KEY);
}

// ── Tile map ─────────────────────────────────────────────────────────────────

const TILE_KEY = 'sim-world-tiles-v1';

export function saveTileMap(data: Record<string, number>) {
  try {
    localStorage.setItem(TILE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full — silently skip
  }
}

export function loadTileMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TILE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function clearTileMap() {
  localStorage.removeItem(TILE_KEY);
}

// ── Ground sheet ─────────────────────────────────────────────────────────────

const GROUND_KEY = 'sim-world-ground-v1';

export interface PersistedGround {
  dataUrl: string;
  columns?: number;
  rows?: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

export function saveGround(ground: PersistedGround) {
  try {
    localStorage.setItem(GROUND_KEY, JSON.stringify(ground));
  } catch {
    // localStorage full — silently skip
  }
}

export function loadGround(): PersistedGround | null {
  try {
    const raw = localStorage.getItem(GROUND_KEY);
    return raw ? (JSON.parse(raw) as PersistedGround) : null;
  } catch {
    return null;
  }
}

export function clearGround() {
  localStorage.removeItem(GROUND_KEY);
}
