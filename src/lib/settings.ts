import type { AppSettings } from "@/types";

const SETTINGS_KEY = "a-eyes-settings";

// .env.local の VITE_PUBLIC_ANTHROPIC_API_KEY をビルド時に埋め込む（Vite 用）
// Vite 環境では process.env は存在しないため import.meta.env を参照する。
// 未定義の場合は空文字列にフォールバックする。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENV_API_KEY =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env &&
    ((import.meta as any).env.VITE_PUBLIC_ANTHROPIC_API_KEY as string | undefined)) ||
  "";

const defaultSettings: AppSettings = {
  accessibilityMode: null,
  workingFolder: null,
  apiKey: ENV_API_KEY, // .env.local の値をデフォルトに
  ttsRate: 1.0,
  ttsVolume: 1.0,
  ttsPitch: 1.0,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return defaultSettings;
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    // localStorage に apiKey が空なら .env の値にフォールバック
    if (!parsed.apiKey) parsed.apiKey = ENV_API_KEY;
    return { ...defaultSettings, ...parsed };
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

export { ENV_API_KEY };
