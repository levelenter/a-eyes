"use client";

import { useState } from "react";
import type { AccessibilityMode, AppSettings } from "@/types";
import { saveSettings } from "@/lib/settings";

interface Props {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onSettingsChange, onClose }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [mode, setMode] = useState<AccessibilityMode>(
    settings.accessibilityMode ?? "built-in-tts"
  );
  const [ttsRate, setTtsRate] = useState(settings.ttsRate);

  function handleSave() {
    const updated = { apiKey, accessibilityMode: mode, ttsRate };
    saveSettings(updated);
    onSettingsChange(updated);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50"
    >
      <div className="bg-gray-900 border-2 border-gray-600 rounded-xl p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 id="settings-title" className="text-xl font-bold text-yellow-400">
            設定
          </h2>
          <button
            onClick={onClose}
            aria-label="設定を閉じる"
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-1">
              Claude API キー
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-gray-800 text-white border border-gray-600 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          {/* Mode */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-300 mb-2">
              アクセシビリティモード
            </legend>
            <div className="space-y-2">
              {(["screen-reader", "built-in-tts"] as AccessibilityMode[]).map((m) => (
                <label key={m} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="accent-yellow-400"
                  />
                  <span className="text-sm text-gray-300">
                    {m === "screen-reader" ? "スクリーンリーダーモード" : "内蔵TTSモード"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* TTS Rate */}
          {mode === "built-in-tts" && (
            <div>
              <label htmlFor="tts-rate" className="block text-sm font-medium text-gray-300 mb-1">
                読み上げ速度: {ttsRate.toFixed(1)}x
              </label>
              <input
                id="tts-rate"
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={ttsRate}
                onChange={(e) => setTtsRate(Number(e.target.value))}
                className="w-full accent-yellow-400"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
