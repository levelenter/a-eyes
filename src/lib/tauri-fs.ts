// Tauri filesystem abstraction
// Falls back to web-fs (in-memory) in non-Tauri environments

import type { FileItem } from "@/types";
import {
  addFiles,
  listWebFiles,
  readWebFile,
  deleteWebFile,
  getWebFile,
  WEB_FOLDER,
} from "@/lib/web-fs";

export let isTauri = false;

if (typeof window !== "undefined") {
  isTauri = "__TAURI__" in window;
}

export async function selectFolder(): Promise<string | null> {
  if (!isTauri) {
    // Web mode: no real folder — return virtual path
    return WEB_FOLDER;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function listFiles(folderPath: string): Promise<FileItem[]> {
  if (!isTauri || folderPath === WEB_FOLDER) {
    return listWebFiles().map((f) => ({
      name: f.name,
      path: `${WEB_FOLDER}/${f.name}`,
      isDirectory: false,
      size: f.size,
    }));
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<FileItem[]>("list_files", { path: folderPath });
}

export async function readTextFile(filePath: string): Promise<string> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    return readWebFile(name);
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(filePath);
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    // Web mode: update in-memory store
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    const blob = new Blob([content], { type: "text/plain" });
    addFiles([new File([blob], name, { type: "text/plain" })]);
    return;
  }
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  return writeTextFile(filePath, content);
}

export async function deleteFile(filePath: string): Promise<void> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    deleteWebFile(name);
    return;
  }
  const { remove } = await import("@tauri-apps/plugin-fs");
  return remove(filePath);
}

export async function openFileInSystem(filePath: string): Promise<void> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    // Web mode: download the file
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    try {
      const text = await readWebFile(name);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      console.warn("openFileInSystem: could not download", name);
    }
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("open_file", { path: filePath });
}

/** Upload files to the in-memory store (web mode). Returns added filenames. */
export function uploadFiles(fileList: FileList | File[]): string[] {
  return addFiles(fileList);
}

/** Read a file as binary (Uint8Array). Works in both Tauri and web mode. */
export async function readBinaryFile(filePath: string): Promise<Uint8Array> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    const entry = getWebFile(name);
    if (!entry) throw new Error(`ファイルが見つかりません: ${name}`);
    const buffer = await entry.file.arrayBuffer();
    return new Uint8Array(buffer);
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(filePath);
}

/** Write binary data to a file. Works in both Tauri and web mode. */
export async function writeBinaryFile(filePath: string, data: Uint8Array): Promise<void> {
  if (!isTauri || filePath.startsWith(WEB_FOLDER)) {
    const name = filePath.replace(`${WEB_FOLDER}/`, "");
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pdf: "application/pdf",
    };
    const mime = mimeMap[ext] ?? "application/octet-stream";
    // new Uint8Array(data) ensures a clean ArrayBuffer-backed copy (avoids SharedArrayBuffer type issues)
    const file = new File([new Uint8Array(data)], name, { type: mime });
    addFiles([file]);
    return;
  }
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  return writeFile(filePath, data);
}

/** Download a binary file to the user's computer (web mode only). */
export function downloadBinaryFile(name: string, data: Uint8Array): void {
  const blob = new Blob([new Uint8Array(data)]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
