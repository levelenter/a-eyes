"use client";

import { useEffect, useState } from "react";
import type { FileItem } from "@/types";
import { listFiles, openFileInSystem, selectFolder } from "@/lib/tauri-fs";

interface Props {
  workingFolder: string | null;
  onFolderChange: (folder: string) => void;
  onFileSelect: (file: FileItem) => void;
  ttsEnabled: boolean;
  onSpeak: (text: string) => void;
}

export default function FilePanel({
  workingFolder,
  onFolderChange,
  onFileSelect,
  onSpeak,
}: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (workingFolder) {
      loadFiles(workingFolder);
    }
  }, [workingFolder]);

  async function loadFiles(folder: string) {
    setLoading(true);
    try {
      const items = await listFiles(folder);
      setFiles(items);
      onSpeak(`フォルダを読み込みました。${items.length}件のアイテムがあります。`);
    } catch {
      onSpeak("フォルダの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectFolder() {
    const folder = await selectFolder();
    if (folder) {
      onFolderChange(folder);
      onSpeak(`作業フォルダを設定しました: ${folder}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(selectedIndex + 1, files.length - 1);
      setSelectedIndex(next);
      if (files[next]) onSpeak(files[next].name);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(prev);
      if (files[prev]) onSpeak(files[prev].name);
    } else if (e.key === "Enter" && files[selectedIndex]) {
      onFileSelect(files[selectedIndex]);
    } else if (e.key === "o" && files[selectedIndex]) {
      openFileInSystem(files[selectedIndex].path);
      onSpeak(`${files[selectedIndex].name}を開きます`);
    }
  }

  return (
    <aside
      className="w-64 bg-gray-900 border-r-2 border-gray-700 flex flex-col"
      aria-label="ファイルパネル"
    >
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={handleSelectFolder}
          className="w-full py-2 px-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors"
          aria-label="作業フォルダを選択"
        >
          フォルダを選択
        </button>
        {workingFolder && (
          <p className="text-xs text-gray-400 mt-2 truncate" title={workingFolder}>
            {workingFolder.split("/").pop()}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!workingFolder && (
          <p className="text-gray-500 text-sm p-4 text-center">
            作業フォルダを選択してください
          </p>
        )}
        {loading && (
          <p className="text-gray-400 text-sm p-4 text-center" aria-live="polite">
            読み込み中...
          </p>
        )}
        {!loading && files.length > 0 && (
          <ul
            role="listbox"
            aria-label="ファイル一覧"
            onKeyDown={handleKeyDown}
            tabIndex={0}
            className="py-1 focus:outline-none"
          >
            {files.map((file, idx) => (
              <li
                key={file.path}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => {
                  setSelectedIndex(idx);
                  onFileSelect(file);
                }}
                className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
                  idx === selectedIndex
                    ? "bg-yellow-500 text-black"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="mr-2" aria-hidden="true">
                  {file.isDirectory ? "📁" : getFileIcon(file.name)}
                </span>
                {file.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-2 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">
          ↑↓で選択, Enterで操作
        </p>
      </div>
    </aside>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pptx":
    case "ppt":
      return "📊";
    case "docx":
    case "doc":
      return "📝";
    case "xlsx":
    case "xls":
      return "📈";
    case "pdf":
      return "📄";
    case "txt":
    case "md":
      return "📃";
    default:
      return "📄";
  }
}
