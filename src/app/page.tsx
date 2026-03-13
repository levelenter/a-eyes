"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccessibilityMode, AgentPlan, AppSettings, FileItem, Message } from "@/types";
import { loadSettings, saveSettings } from "@/lib/settings";
import { speak, stop as ttsStop } from "@/lib/tts";
import { isTauri, getWorkingFolder } from "@/lib/tauri-fs";
import ModeSelectionDialog from "@/components/ModeSelectionDialog";
import FilePanel from "@/components/FilePanel";
import ChatPanel from "@/components/ChatPanel";
import SettingsPanel from "@/components/SettingsPanel";
import AgentPlanView from "@/components/AgentPlanView";

export default function Home() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Load settings on mount.
  useEffect(() => {
    const s = loadSettings();
    if (isTauri) {
      setSettings({ ...s, workingFolder: null });
      getWorkingFolder().then((folder) => {
        if (folder) {
          setSettings((prev) => (prev ? { ...prev, workingFolder: folder } : prev));
        }
      });
      return;
    }
    setSettings({ ...s, workingFolder: null });
    saveSettings({ workingFolder: null });
    fetch("/api/config")
      .then((r) => r.json())
      .then(({ webWorkingFolder }: { webWorkingFolder: string | null }) => {
        if (webWorkingFolder) {
          setSettings((prev) => (prev ? { ...prev, workingFolder: webWorkingFolder } : prev));
        }
      })
      .catch(() => {});
  }, []);

  const isTTSMode = settings?.accessibilityMode === "built-in-tts";

  const handleSpeak = useCallback(
    (text: string) => {
      if (!isTTSMode) return; // Screen reader mode: let the SR handle it
      setIsSpeaking(true);
      speak(text, { rate: settings?.ttsRate ?? 1.0 }).finally(() =>
        setIsSpeaking(false)
      );
    },
    [isTTSMode, settings?.ttsRate]
  );

  function handleModeSelect(mode: AccessibilityMode) {
    saveSettings({ accessibilityMode: mode });
    setSettings((prev) => ({ ...prev!, accessibilityMode: mode }));
    if (mode === "built-in-tts") {
      speak("内蔵TTSモードで起動しました。A-Eyesへようこそ。");
    }
  }

  function handleFolderChange(folder: string) {
    const updated = { ...settings!, workingFolder: folder };
    saveSettings({ workingFolder: folder });
    setSettings(updated);
  }

  function handleFileSelect(file: FileItem) {
    const content = file.isDirectory
      ? `フォルダ: ${file.name}`
      : `ファイル: ${file.name} を選択しました。チャットで操作を指示してください。`;
    handleSpeak(content);

    if (!file.isDirectory) {
      setSelectedFile(file.path);
    }
  }

  function handleAddMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function handleUpdateMessage(id: string, content: string, streaming: boolean) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content, isStreaming: streaming } : m
      )
    );
  }

  function handleSettingsChange(updated: Partial<AppSettings>) {
    setSettings((prev) => ({ ...prev!, ...updated }));
  }

  function handleStopSpeaking() {
    ttsStop();
    setIsSpeaking(false);
  }

  // Keyboard shortcut: Escape stops TTS
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isSpeaking) {
        handleStopSpeaking();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSpeaking]);

  // Show mode selection dialog if mode not set
  if (!settings) return null; // Loading
  if (settings.accessibilityMode === null) {
    return <ModeSelectionDialog onSelect={handleModeSelect} />;
  }

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-2 bg-gray-950 border-b-2 border-gray-800"
        role="banner"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-yellow-400">A-Eyes</h1>
          <span
            className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
            aria-label={`モード: ${settings.accessibilityMode === "built-in-tts" ? "内蔵TTS" : "スクリーンリーダー"}`}
          >
            {settings.accessibilityMode === "built-in-tts" ? "TTS" : "SR"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isTTSMode && isSpeaking && (
            <button
              onClick={handleStopSpeaking}
              aria-label="読み上げを停止 (Escキー)"
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded-lg"
            >
              ■ 停止
            </button>
          )}
          {!settings.apiKey && (
            <button
              onClick={() => setShowSettings(true)}
              aria-label="APIキーを設定してください"
              className="px-3 py-1 bg-red-800 hover:bg-red-700 text-red-200 text-xs rounded-lg animate-pulse"
            >
              ⚠ APIキー未設定
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="設定を開く"
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
          >
            設定 ⚙
          </button>
        </div>
      </header>

      {/* Skip link for keyboard navigation */}
      <a
        href="#chat-input"
        className="sr-only focus:not-sr-only focus:absolute focus:top-14 focus:left-4 focus:z-50 focus:bg-yellow-400 focus:text-black focus:px-3 focus:py-1 focus:rounded"
      >
        チャット入力にスキップ
      </a>

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden" role="main">
        <FilePanel
          workingFolder={settings.workingFolder}
          onFolderChange={handleFolderChange}
          onFilesChange={(names) => setFileNames(names)}
          onFileSelect={handleFileSelect}
          ttsEnabled={isTTSMode}
          onSpeak={handleSpeak}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Agent plan view */}
          {currentPlan && (
            <AgentPlanView
              plan={currentPlan}
              onClose={() => setCurrentPlan(null)}
            />
          )}

          {/* Chat */}
          <div id="chat-input" className="flex flex-col flex-1 overflow-hidden">
            <ChatPanel
              messages={displayMessages}
              onAddMessage={handleAddMessage}
              onUpdateMessage={handleUpdateMessage}
              workingFolder={settings.workingFolder}
              fileNames={fileNames}
              selectedFile={selectedFile}
              apiKey={settings.apiKey}
              onSpeak={handleSpeak}
              onPlan={setCurrentPlan}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        </div>
      </main>

      {/* Settings dialog */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
