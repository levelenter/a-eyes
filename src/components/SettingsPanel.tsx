"use client";

import { useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import type { AccessibilityMode, AppSettings } from "@/types";
import { saveSettings, ENV_API_KEY } from "@/lib/settings";

interface Props {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onClose: () => void;
}

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function SettingsPanel({ settings, onSettingsChange, onClose }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [mode, setMode] = useState<AccessibilityMode>(
    settings.accessibilityMode ?? "built-in-tts"
  );
  const [ttsRate, setTtsRate] = useState(settings.ttsRate);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  // The key to actually use: typed input > current settings > env
  const effectiveKey = apiKey.trim() || settings.apiKey || ENV_API_KEY;
  const keySource = apiKey.trim()
    ? "手動入力"
    : settings.apiKey
    ? "保存済み"
    : ENV_API_KEY
    ? ".env.local"
    : "未設定";

  async function handleTestKey() {
    if (!effectiveKey) {
      setTestStatus("fail");
      setTestMessage("APIキーが入力されていません");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const client = new Anthropic({ apiKey: effectiveKey, dangerouslyAllowBrowser: true });
      await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }],
      });
      setTestStatus("ok");
      setTestMessage("接続成功！キーは有効です。");
    } catch (err) {
      setTestStatus("fail");
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("authentication_error")) {
        setTestMessage("認証エラー：キーが無効か期限切れです");
      } else if (msg.includes("fetch") || msg.includes("network")) {
        setTestMessage("ネットワークエラー：接続を確認してください");
      } else {
        setTestMessage("テスト失敗：" + msg.slice(0, 60));
      }
    }
  }

  function handleResetKey() {
    setApiKey("");
    setTestStatus("idle");
    setTestMessage("");
    // Clear from localStorage too
    saveSettings({ apiKey: ENV_API_KEY || "" });
    onSettingsChange({ apiKey: ENV_API_KEY || "" });
  }

  function handleSave() {
    const updated: Partial<AppSettings> = {
      apiKey: effectiveKey,
      accessibilityMode: mode,
      ttsRate,
    };
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
          <h2 id="settings-title" className="text-xl font-bold text-yellow-400">設定</h2>
          <button onClick={onClose} aria-label="設定を閉じる" className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="space-y-5">
          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="api-key" className="text-sm font-medium text-gray-300">
                Claude API キー
              </label>
              <span className="text-xs text-gray-500">
                現在の取得元:
                <span className={`ml-1 font-medium ${effectiveKey ? "text-green-400" : "text-red-400"}`}>
                  {keySource}
                </span>
              </span>
            </div>

            <div className="flex gap-2">
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestStatus("idle"); }}
                placeholder={settings.apiKey ? "（保存済み・変更する場合のみ入力）" : ENV_API_KEY ? "（.env.local から取得済み）" : "sk-ant-..."}
                className="flex-1 bg-gray-800 text-white border border-gray-600 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={handleResetKey}
                title="キャッシュをクリアして.env.localの値を使用"
                className="px-2 py-2 bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white rounded-lg text-xs transition-colors"
                aria-label="APIキーをリセット"
              >
                リセット
              </button>
            </div>

            {/* Connection test */}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testStatus === "testing"}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
              >
                {testStatus === "testing" ? "テスト中..." : "接続テスト"}
              </button>
              {testStatus === "ok" && (
                <span className="text-green-400 text-xs">✓ {testMessage}</span>
              )}
              {testStatus === "fail" && (
                <span className="text-red-400 text-xs">✗ {testMessage}</span>
              )}
            </div>

            {!effectiveKey && (
              <p className="text-yellow-500 text-xs mt-1">
                .env.local の VITE_PUBLIC_ANTHROPIC_API_KEY を設定するか、上のフィールドに入力してください。
                設定後は <code className="bg-gray-800 px-1 rounded">npm run dev:all</code> を再起動してください。
              </p>
            )}
          </div>

          {/* Mode */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-300 mb-2">アクセシビリティモード</legend>
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
