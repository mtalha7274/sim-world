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

export type AnimationState = 'idle' | 'walk' | 'jump' | 'run';

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
