"use client";

import { useEffect } from "react";
import type { AccessibilityMode } from "@/types";

interface Props {
  onSelect: (mode: AccessibilityMode) => void;
}

export default function ModeSelectionDialog({ onSelect }: Props) {
  useEffect(() => {
    // Auto-announce dialog for screen readers
    const announcement = document.getElementById("mode-dialog-title");
    announcement?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-dialog-title"
      className="fixed inset-0 bg-black flex items-center justify-center p-6 z-50"
    >
      <div className="bg-gray-900 border-2 border-yellow-400 rounded-xl p-8 max-w-lg w-full">
        <h1
          id="mode-dialog-title"
          tabIndex={-1}
          className="text-2xl font-bold text-yellow-400 mb-4 text-center"
        >
          A-Eyes へようこそ
        </h1>
        <p className="text-gray-200 mb-8 text-center text-lg">
          アクセシビリティモードを選択してください
        </p>

        <div className="space-y-4">
          <button
            onClick={() => onSelect("screen-reader")}
            className="w-full p-6 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 hover:border-yellow-400 rounded-lg text-left transition-colors focus-visible:border-yellow-400"
            aria-describedby="sr-mode-desc"
          >
            <div className="text-xl font-semibold text-white mb-2">
              スクリーンリーダーモード
            </div>
            <div id="sr-mode-desc" className="text-gray-400 text-sm">
              NVDAやVoiceOverなどの外部スクリーンリーダーをご利用の方向け。
              アプリはスクリーンリーダーと連携して動作します。
            </div>
          </button>

          <button
            onClick={() => onSelect("built-in-tts")}
            className="w-full p-6 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 hover:border-yellow-400 rounded-lg text-left transition-colors focus-visible:border-yellow-400"
            aria-describedby="tts-mode-desc"
          >
            <div className="text-xl font-semibold text-white mb-2">
              内蔵TTSモード
            </div>
            <div id="tts-mode-desc" className="text-gray-400 text-sm">
              アプリ内蔵の音声読み上げ機能を使用します。
              外部スクリーンリーダーが不要です。
            </div>
          </button>
        </div>

        <p className="text-gray-500 text-xs mt-6 text-center">
          このモードは後で設定から変更できます
        </p>
      </div>
    </div>
  );
}
