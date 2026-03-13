"use client";

import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/types";
import {
  listFiles,
  openFileInSystem,
  selectFolder,
  uploadFiles,
  deleteFile,
  isTauri,
} from "@/lib/tauri-fs";

interface Props {
  workingFolder: string | null;
  onFolderChange: (folder: string) => void;
  onFilesChange?: (fileNames: string[]) => void;
  onFileSelect: (file: FileItem) => void;
  ttsEnabled: boolean;
  onSpeak: (text: string) => void;
}

export default function FilePanel({
  workingFolder,
  onFolderChange,
  onFilesChange,
  onFileSelect,
  onSpeak,
}: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load files when folder changes
  useEffect(() => {
    // Web モードでは workingFolder に関係なくサーバー側の作業フォルダ一覧を取得する。
    // Tauri モードのみ、ユーザーが選択したフォルダに応じて読み込む。
    if (isTauri) {
      if (workingFolder) {
        loadFiles(workingFolder);
      }
    } else {
      loadFiles(workingFolder ?? "");
    }
  }, [workingFolder]);

  async function loadFiles(folder: string) {
    setLoading(true);
    try {
      const items = await listFiles(folder);
      setFiles(items);
      onFilesChange?.(items.filter((f) => !f.isDirectory).map((f) => f.name));
      if (items.length > 0) {
        onSpeak(`${items.length}件のファイルがあります。`);
      }
    } catch {
      onSpeak("ファイル一覧の読み込みに失敗しました。");
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

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const saved = await uploadFiles(fileList);
      onSpeak(`${saved.length}件のファイルをアップロードしました。`);
      // アップロード後にファイル一覧を更新
      if (isTauri ? !!workingFolder : true) {
        loadFiles(workingFolder ?? "");
      }
    } catch {
      onSpeak("アップロードに失敗しました。");
    }
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const fileList = e.dataTransfer.files;
    if (fileList.length === 0) return;
    try {
      const saved = await uploadFiles(fileList);
      onSpeak(`${saved.length}件のファイルをドロップしました。`);
      if (isTauri ? !!workingFolder : true) {
        loadFiles(workingFolder ?? "");
      }
    } catch {
      onSpeak("アップロードに失敗しました。");
    }
  }

  async function handleDeleteFile(file: FileItem, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteFile(file.path);
    onSpeak(`${file.name}を削除しました。`);
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
    } else if (e.key === "Delete" && files[selectedIndex] && !isTauri) {
      deleteFile(files[selectedIndex].path);
      onSpeak(`${files[selectedIndex].name}を削除しました。`);
    }
  }

  return (
    <aside
      className="w-64 bg-gray-900 border-r-2 border-gray-700 flex flex-col"
      aria-label="ファイルパネル"
    >
      {/* Header: folder selector (Tauri) or upload button (web) */}
      <div className="p-3 border-b border-gray-700 space-y-2">
        {isTauri ? (
          <>
            <button
              onClick={handleSelectFolder}
              className="w-full py-2 px-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors"
              aria-label="作業フォルダを選択"
            >
              フォルダを選択
            </button>
            {workingFolder && (
              <p className="text-xs text-gray-400 truncate" title={workingFolder}>
                {workingFolder.split("/").pop()}
              </p>
            )}
          </>
        ) : ( /* Web モード: サーバーフォルダへのアップロード */
          <>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="ファイルを選択してアップロード"
              onChange={handleFileInputChange}
            />
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors"
              aria-label="ファイルをアップロード"
            >
              ＋ ファイルを追加
            </button>
            {/* Drag & drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg px-2 py-3 text-center text-xs transition-colors cursor-pointer ${
                isDragOver
                  ? "border-yellow-400 bg-yellow-400/10 text-yellow-300"
                  : "border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-400"
              }`}
              aria-label="ファイルをここにドロップ"
              role="region"
            >
              {isDragOver ? "ここで離す" : "ここにドロップ"}
            </div>
          </>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {!workingFolder && isTauri && (
          <p className="text-gray-500 text-sm p-4 text-center">
            作業フォルダを選択してください
          </p>
        )}
        {!workingFolder && !isTauri && (
          <p className="text-gray-500 text-sm p-4 text-center">
            サーバー作業フォルダを取得中...
          </p>
        )}
        {loading && (
          <p className="text-gray-400 text-sm p-4 text-center" aria-live="polite">
            読み込み中...
          </p>
        )}
        {!loading && files.length === 0 && workingFolder && (
          <p className="text-gray-500 text-sm p-4 text-center">
            {isTauri
              ? "ファイルがありません"
              : "ファイルをアップロードしてください"}
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
                className={`flex items-center gap-1 px-3 py-2 cursor-pointer text-sm transition-colors group ${
                  idx === selectedIndex
                    ? "bg-yellow-500 text-black"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="mr-1 flex-shrink-0" aria-hidden="true">
                  {file.isDirectory ? "📁" : getFileIcon(file.name)}
                </span>
                <span className="flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                {/* Delete button — web mode only */}
                {!isTauri && !file.isDirectory && (
                  <button
                    onClick={(e) => handleDeleteFile(file, e)}
                    aria-label={`${file.name}を削除`}
                    title="削除"
                    className={`flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs px-1 py-0.5 rounded transition-opacity ${
                      idx === selectedIndex
                        ? "text-black hover:bg-yellow-600"
                        : "text-gray-400 hover:text-red-400 hover:bg-gray-700"
                    }`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer hint */}
      <div className="p-2 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">
          {isTauri ? "↑↓で選択, Enterで操作" : "↑↓で選択, Enterで選択, Delで削除"}
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
