/**
 * Tool definitions and executors for the Claude agentic loop.
 * These tools give Claude the ability to actually operate on files.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  listFiles,
  readTextFile,
  writeTextFile,
  readBinaryFile,
  writeBinaryFile,
  downloadBinaryFile,
  isTauri,
} from "@/lib/tauri-fs";
import { WEB_FOLDER } from "@/lib/web-fs";
import { readPptxSlides, insertTocSlide } from "@/lib/pptx-tools";

export interface ToolContext {
  workingFolder: string | null;
  selectedFile: string | null;
}

// ─────────────────────────────────────────────
// Tool definitions (passed to Claude API)
// ─────────────────────────────────────────────

export const FILE_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_files",
    description:
      "作業フォルダ内のファイル一覧を表示します。どのファイルが存在するか確認するときに使います。",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "read_text_file",
    description:
      "テキストファイル（.txt, .md, .csv など）の内容を読み取ります。",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "読み取るファイル名（例: 'memo.txt'）",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "write_text_file",
    description: "テキストファイルに内容を書き込みます（上書き保存）。",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "書き込むファイル名" },
        content: { type: "string", description: "書き込む内容" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "pptx_read_slides",
    description:
      "PowerPoint (.pptx) ファイルの全スライドのタイトルと番号を読み取ります。目次作成や内容確認に使います。",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "PPTXファイル名（例: 'presentation.pptx'）",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "pptx_insert_toc",
    description:
      "PowerPoint (.pptx) ファイルに目次スライドを挿入します。スライドタイトルを自動収集して目次を作成し、上書き保存します。",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "対象のPPTXファイル名",
        },
        insert_after_slide: {
          type: "number",
          description:
            "何枚目のスライドの後に目次を挿入するか（デフォルト: 1 = 表紙の後）",
        },
      },
      required: ["filename"],
    },
  },
];

// ─────────────────────────────────────────────
// Tool executor
// ─────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (toolName) {
    case "list_files": {
      // Web モードでは作業フォルダはサーバー側で固定されているため、
      // context.workingFolder が null でも一覧取得を試みる。
      const folder = context.workingFolder ?? "";
      const files = await listFiles(folder);
      if (files.length === 0) return "フォルダにファイルがありません。";
      return files
        .map(
          (f) =>
            `- ${f.name}${f.isDirectory ? "/" : ""}${f.size ? ` (${fmtSize(f.size)})` : ""}`
        )
        .join("\n");
    }

    case "read_text_file": {
      const filename = String(toolInput.filename ?? "");
      const path = resolvePath(filename, context);
      const content = await readTextFile(path);
      // Truncate very large files to avoid huge context
      if (content.length > 8000) {
        return content.slice(0, 8000) + "\n\n... (以下省略)";
      }
      return content;
    }

    case "write_text_file": {
      const filename = String(toolInput.filename ?? "");
      const content = String(toolInput.content ?? "");
      const path = resolvePath(filename, context);
      await writeTextFile(path, content);
      return `「${filename}」を保存しました（${content.length}文字）。`;
    }

    case "pptx_read_slides": {
      const filename = String(toolInput.filename ?? "");
      const path = resolvePath(filename, context);
      const data = await readBinaryFile(path);
      const slides = await readPptxSlides(data.buffer as ArrayBuffer);
      const lines = slides.map((s) => `スライド${s.index}: ${s.title}`);
      return `${slides.length}枚のスライドが見つかりました:\n${lines.join("\n")}`;
    }

    case "pptx_insert_toc": {
      const filename = String(toolInput.filename ?? "");
      const insertAfter =
        typeof toolInput.insert_after_slide === "number"
          ? toolInput.insert_after_slide
          : 1;
      const path = resolvePath(filename, context);

      // Read → parse → insert TOC → save
      const data = await readBinaryFile(path);
      const slides = await readPptxSlides(data.buffer as ArrayBuffer);
      const newData = await insertTocSlide(data.buffer as ArrayBuffer, slides, insertAfter);

      await writeBinaryFile(path, newData);

      // In web mode, also auto-download so the user gets the file
      if (!isTauri) {
        downloadBinaryFile(filename, newData);
      }

      const tocCount = slides.filter(
        (s) => !s.title.match(/^スライド \d+$/)
      ).length;
      const saveNote = isTauri
        ? "元のファイルを上書き保存しました。"
        : "ブラウザからダウンロードが開始されました。";
      return `目次スライドを「${filename}」のスライド${insertAfter}の後に挿入しました。${tocCount}件のタイトルが目次に含まれています。${saveNote}`;
    }

    default:
      return `不明なツール: ${toolName}`;
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function resolvePath(filename: string, context: ToolContext): string {
  // Web/Electron モードでは API がサーバー側の作業フォルダを固定で扱うため、
  // 相対パス（ファイル名）のみを渡せばよい。
  if (!isTauri) {
    return filename;
  }
  // Tauri モードのみ、明示的なフォルダパスを使って解決する。
  if (filename.startsWith("/") || filename.startsWith("web://")) return filename;
  const folder = context.workingFolder ?? WEB_FOLDER;
  return folder.endsWith("/") ? `${folder}${filename}` : `${folder}/${filename}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
