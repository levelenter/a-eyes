/**
 * アプリ用ファイルシステム抽象レイヤー（Tauri / Web 共通）
 *
 * Tauri 実行時は Rust コマンド（invoke）でファイル操作。
 * Web 実行時は /api/files, /api/upload 経由。
 */

import type { FileItem } from "@/types";

// Tauri 環境では window.__TAURI__ が存在する
declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
      dialog?: { open: (options?: { directory?: boolean; multiple?: boolean }) => Promise<string | string[] | null> };
    };
  }
}

function isTauriEnv(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

export const isTauri = isTauriEnv();

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__?.core) throw new Error("Tauri API is not available.");
  return window.__TAURI__.core.invoke<T>(cmd, args);
}

// ─────────────────────────────────────────────
// API route helpers (Web 用)
// ─────────────────────────────────────────────

async function apiGet(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/files?${qs}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function apiPost(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
}

async function apiDelete(filePath: string): Promise<void> {
  const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** 現在の作業フォルダを取得（Tauri のみ。未設定時は null） */
export async function getWorkingFolder(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("get_working_folder");
}

/** フォルダ選択ダイアログ（Tauri ではネイティブダイアログ、Web では null） */
export async function selectFolder(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ directory: true, multiple: false });
    if (result == null) return null;
    const path = Array.isArray(result) ? result[0] : result;
    if (path) {
      await invoke("set_working_folder", { path });
      return path;
    }
    return null;
  }
  return null;
}

interface TauriFileItem {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number;
}

export async function listFiles(folderPath: string): Promise<FileItem[]> {
  if (isTauri) {
    const items = await invoke<TauriFileItem[]>("list_files");
    return items.map((e) => ({
      name: e.name,
      path: e.path,
      isDirectory: e.is_directory,
      size: e.size,
    }));
  }
  const res = (await apiGet({})) as { items: FileItem[] };
  return res.items;
}

export async function readTextFile(filePath: string): Promise<string> {
  if (isTauri) {
    return invoke<string>("read_text_file", { path: filePath });
  }
  const res = (await apiGet({ path: filePath })) as { content: string };
  return res.content;
}

export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  if (isTauri) {
    await invoke("write_text_file", { path: filePath, content });
    return;
  }
  await apiPost({ path: filePath, content });
}

export async function deleteFile(filePath: string): Promise<void> {
  if (isTauri) {
    await invoke("delete_file", { path: filePath });
    return;
  }
  await apiDelete(filePath);
}

export async function openFileInSystem(filePath: string): Promise<void> {
  if (isTauri) {
    await invoke("open_in_system", { path: filePath });
    return;
  }
  try {
    const res = (await apiGet({ path: filePath, binary: "1" })) as {
      content: string;
      binary: boolean;
    };
    const bytes = Uint8Array.from(atob(res.content), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filePath.split("/").pop() ?? filePath;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    console.warn("openFileInSystem: ダウンロード失敗", filePath);
  }
}

/** ファイルをサーバーにアップロードする（Web 用）。Tauri では作業フォルダにコピーする別 UI を想定。 */
export async function uploadFiles(
  fileList: FileList | File[]
): Promise<string[]> {
  if (isTauri) {
    const folder = await invoke<string | null>("get_working_folder");
    if (!folder) throw new Error("作業フォルダを先に選択してください。");
    const saved: string[] = [];
    for (const file of Array.from(fileList)) {
      const buf = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buf));
      await invoke("write_binary_file", { path: file.name, data: bytes });
      saved.push(file.name);
    }
    return saved;
  }
  const form = new FormData();
  for (const file of Array.from(fileList)) {
    form.append("files", file, file.name);
  }
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.saved as string[];
}

/** Read a file as binary (Uint8Array). */
export async function readBinaryFile(filePath: string): Promise<Uint8Array> {
  if (isTauri) {
    const data = await invoke<number[]>("read_binary_file", { path: filePath });
    return new Uint8Array(data);
  }
  const res = (await apiGet({ path: filePath, binary: "1" })) as {
    content: string;
  };
  return Uint8Array.from(atob(res.content), (c) => c.charCodeAt(0));
}

/** Write binary data to a file. */
export async function writeBinaryFile(
  filePath: string,
  data: Uint8Array
): Promise<void> {
  if (isTauri) {
    await invoke("write_binary_file", { path: filePath, data: Array.from(data) });
    return;
  }
  const b64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  await apiPost({ path: filePath, content: b64, binary: true });
  downloadBinaryFile(filePath.split("/").pop() ?? filePath, data);
}

/** Download a binary file to the user's computer. */
export function downloadBinaryFile(name: string, data: Uint8Array): void {
  const blob = new Blob([new Uint8Array(data)]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
