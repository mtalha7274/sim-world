const KEY = 'sim-world-settings-v1';

export interface Settings {
  openrouterApiKey: string;
  openrouterModel: string;
}

const DEFAULTS: Settings = {
  openrouterApiKey: '',
  openrouterModel: '',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // localStorage full — silently skip
  }
}
