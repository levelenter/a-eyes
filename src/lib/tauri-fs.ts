// Tauri filesystem abstraction
// Falls back to mock in non-Tauri environments (browser dev)

import type { FileItem } from "@/types";

let isTauri = false;

if (typeof window !== "undefined") {
  isTauri = "__TAURI__" in window;
}

export async function selectFolder(): Promise<string | null> {
  if (!isTauri) {
    console.warn("selectFolder: not in Tauri environment");
    return "/mock/working/folder";
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function listFiles(folderPath: string): Promise<FileItem[]> {
  if (!isTauri) {
    return [
      { name: "example.txt", path: `${folderPath}/example.txt`, isDirectory: false, size: 1024 },
      { name: "presentation.pptx", path: `${folderPath}/presentation.pptx`, isDirectory: false, size: 204800 },
      { name: "docs", path: `${folderPath}/docs`, isDirectory: true },
    ];
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<FileItem[]>("list_files", { path: folderPath });
}

export async function readTextFile(filePath: string): Promise<string> {
  if (!isTauri) {
    return `Mock content of ${filePath}`;
  }
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(filePath);
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  if (!isTauri) {
    console.warn("writeTextFile: not in Tauri environment", filePath);
    return;
  }
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  return writeTextFile(filePath, content);
}

export async function deleteFile(filePath: string): Promise<void> {
  if (!isTauri) {
    console.warn("deleteFile: not in Tauri environment", filePath);
    return;
  }
  const { remove } = await import("@tauri-apps/plugin-fs");
  return remove(filePath);
}

export async function openFileInSystem(filePath: string): Promise<void> {
  if (!isTauri) {
    console.warn("openFileInSystem: not in Tauri environment", filePath);
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("open_file", { path: filePath });
}
