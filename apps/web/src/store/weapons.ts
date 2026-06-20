const KEY = 'sim-world-weapons-v1';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  rangeInCells: number;
  description: string;
}

const DEFAULTS: WeaponDef[] = [
  { id: 'fist',  name: 'Fist',  damage: 5,  rangeInCells: 1, description: 'Bare-handed strike.' },
  { id: 'sword', name: 'Sword', damage: 20, rangeInCells: 1, description: 'A sharp blade.' },
  { id: 'axe',   name: 'Axe',   damage: 35, rangeInCells: 1, description: 'Heavy and brutal.' },
  { id: 'spear', name: 'Spear', damage: 15, rangeInCells: 2, description: 'Longer reach, moderate damage.' },
];

export function loadWeapons(): WeaponDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WeaponDef[]) : [...DEFAULTS];
  } catch {
    return [...DEFAULTS];
  }
}

export function saveWeapons(weapons: WeaponDef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(weapons));
  } catch {
    // localStorage full
  }
}

let _nextId = Date.now();
export function newWeaponId(): string { return `w-${_nextId++}`; }
