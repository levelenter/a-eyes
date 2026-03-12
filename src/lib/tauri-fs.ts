/**
 * アプリ用ファイルシステム抽象レイヤー（Electron / Web共通）
 *
 * Electron では window.__TAURI__ が存在しないため、すべての操作は
 * Next.js API ルート (/api/files, /api/upload) 経由で行う。
 */

import type { FileItem } from "@/types";

// Legacy flag kept for compatibility — always false in Electron/web
export const isTauri = false;

// ─────────────────────────────────────────────
// API route helpers
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

/** フォルダ選択ダイアログ（現在はElectron IPCは未実装のためnullを返す） */
export async function selectFolder(): Promise<string | null> {
  return null;
}

export async function listFiles(_folderPath: string): Promise<FileItem[]> {
  const res = (await apiGet({})) as { items: FileItem[] };
  return res.items;
}

export async function readTextFile(filePath: string): Promise<string> {
  const res = (await apiGet({ path: filePath })) as { content: string };
  return res.content;
}

export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  await apiPost({ path: filePath, content });
}

export async function deleteFile(filePath: string): Promise<void> {
  await apiDelete(filePath);
}

export async function openFileInSystem(filePath: string): Promise<void> {
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

/** ファイルをサーバーにアップロードする。返り値は保存されたファイル名リスト。 */
export async function uploadFiles(
  fileList: FileList | File[]
): Promise<string[]> {
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
