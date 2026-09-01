/**
 * User preferences.
 *
 * These are applied as data attributes on <html> and read by CSS, so a
 * preference takes effect everywhere at once — including surfaces that were
 * rendered before the setting changed. Kept in localStorage because they are
 * per-device, not per-account.
 */

export type TextSize = "default" | "large" | "xlarge";
export type ContrastMode = "default" | "high";
export type MotionMode = "default" | "reduced";
export type FontChoice = "default" | "dyslexic";
export type LanguageCode = "en" | "es" | "ja" | "zh";

export type Settings = {
  textSize: TextSize;
  contrast: ContrastMode;
  motion: MotionMode;
  font: FontChoice;
  /** Draws a thicker outline on whatever has keyboard focus. */
  focusRing: boolean;
  /** Underlines every link, not just on hover. */
  underlineLinks: boolean;
  language: LanguageCode;
  /** Ask before anything is deleted. */
  confirmDestructive: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  textSize: "default",
  contrast: "default",
  motion: "default",
  font: "default",
  focusRing: false,
  underlineLinks: false,
  language: "en",
  confirmDestructive: true,
};

const STORAGE_KEY = "promptlab_settings";
const UPDATED_EVENT = "promptlab:settings-updated";

function read(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(saved) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Writes the settings onto <html> so CSS can respond. Called on load and on
 * every change, rather than threading props through every component.
 */
export function applySettings(settings: Settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.dataset.textSize = settings.textSize;
  root.dataset.contrast = settings.contrast;
  root.dataset.motion = settings.motion;
  root.dataset.font = settings.font;
  root.dataset.focusRing = settings.focusRing ? "on" : "off";
  root.dataset.underlineLinks = settings.underlineLinks ? "on" : "off";
  root.lang = settings.language;
}

function write(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applySettings(settings);
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

export const settingsStore = {
  eventName: UPDATED_EVENT,

  getAll(): Settings {
    return read();
  },

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    write({ ...read(), [key]: value });
  },

  reset() {
    write({ ...DEFAULT_SETTINGS });
  },

  /** Applies the stored preferences at boot, before React paints. */
  init() {
    applySettings(read());
  },
};
