/**
 * Web mode in-memory file store.
 * Used when running in a browser (non-Tauri) environment.
 */

export interface WebFileEntry {
  name: string;
  file: File;
  size: number;
  cachedText?: string;
}

// Singleton in-memory store
const store = new Map<string, WebFileEntry>();

// Listeners for file list changes
const listeners = new Set<() => void>();

export function subscribeFileChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function addFiles(fileList: FileList | File[]): string[] {
  const added: string[] = [];
  for (const file of Array.from(fileList)) {
    store.set(file.name, { name: file.name, file, size: file.size });
    added.push(file.name);
  }
  notify();
  return added;
}

export function listWebFiles(): WebFileEntry[] {
  return Array.from(store.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ja")
  );
}

export async function readWebFile(name: string): Promise<string> {
  const entry = store.get(name);
  if (!entry) throw new Error(`ファイルが見つかりません: ${name}`);
  if (entry.cachedText !== undefined) return entry.cachedText;
  const text = await entry.file.text();
  entry.cachedText = text;
  return text;
}

export function deleteWebFile(name: string): void {
  store.delete(name);
  notify();
}

export function getWebFile(name: string): WebFileEntry | undefined {
  return store.get(name);
}

export function clearWebFiles(): void {
  store.clear();
  notify();
}

export function webFileCount(): number {
  return store.size;
}

/** Virtual folder path used in web mode */
export const WEB_FOLDER = "web://uploads";
