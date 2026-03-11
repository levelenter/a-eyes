import type { AppSettings } from "@/types";

const SETTINGS_KEY = "a-eyes-settings";

const defaultSettings: AppSettings = {
  accessibilityMode: null,
  workingFolder: null,
  apiKey: "",
  ttsRate: 1.0,
  ttsVolume: 1.0,
  ttsPitch: 1.0,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    console.error("Failed to save settings");
  }
}
