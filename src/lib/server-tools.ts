/**
 * サーバーサイドツール実行（Next.js API route 専用）
 * Node.js fs モジュールを使って WEB_WORKING_FOLDER 内のファイルを操作する。
 */
import * as fs from "fs";
import * as path from "path";

export const WEB_WORKING_FOLDER =
  process.env.WEB_WORKING_FOLDER ?? "/tmp/a-eyes-web";

/** パストラバーサル防止: WEB_WORKING_FOLDER 内に収まるパスを返す */
function resolveSafe(filename: string, folder: string): string {
  const base = path.resolve(folder);
  // 絶対パスが既にベースフォルダ配下なら そのまま使用
  const candidate = path.isAbsolute(filename)
    ? filename
    : path.resolve(base, filename);
  if (!candidate.startsWith(base + path.sep) && candidate !== base) {
    throw new Error("アクセス拒否: フォルダ外へのアクセスはできません");
  }
  return candidate;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function executeToolServer(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string | null
): Promise<string> {
  const folder = cwd ?? WEB_WORKING_FOLDER;
  // フォルダが無ければ作成
  fs.mkdirSync(folder, { recursive: true });

  switch (toolName) {
    case "list_files": {
      const entries = fs.readdirSync(folder, { withFileTypes: true });
      if (entries.length === 0) return "フォルダにファイルがありません。";
      return entries
        .map(
          (e) =>
            `- ${e.name}${e.isDirectory() ? "/" : ""}${
              e.isFile()
                ? ` (${fmtSize(fs.statSync(path.join(folder, e.name)).size)})`
                : ""
            }`
        )
        .join("\n");
    }

    case "read_text_file": {
      const filename = String(toolInput.filename ?? "");
      const abs = resolveSafe(filename, folder);
      if (!fs.existsSync(abs))
        return `ファイルが見つかりません: ${filename}`;
      const content = fs.readFileSync(abs, "utf-8");
      return content.length > 8000
        ? content.slice(0, 8000) + "\n\n... (以下省略)"
        : content;
    }

    case "write_text_file": {
      const filename = String(toolInput.filename ?? "");
      const content = String(toolInput.content ?? "");
      const abs = resolveSafe(filename, folder);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf-8");
      return `「${filename}」を保存しました（${content.length}文字）。`;
    }

    case "pptx_read_slides": {
      const filename = String(toolInput.filename ?? "");
      const abs = resolveSafe(filename, folder);
      if (!fs.existsSync(abs))
        return `ファイルが見つかりません: ${filename}`;
      const buf = fs.readFileSync(abs);
      const { readPptxSlides } = await import("@/lib/pptx-tools");
      const slides = await readPptxSlides(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      );
      const lines = slides.map((s) => `スライド${s.index}: ${s.title}`);
      return `${slides.length}枚のスライドが見つかりました:\n${lines.join("\n")}`;
    }

    case "pptx_insert_toc": {
      const filename = String(toolInput.filename ?? "");
      const insertAfter =
        typeof toolInput.insert_after_slide === "number"
          ? toolInput.insert_after_slide
          : 1;
      const abs = resolveSafe(filename, folder);
      if (!fs.existsSync(abs))
        return `ファイルが見つかりません: ${filename}`;
      const buf = fs.readFileSync(abs);
      const abuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const { readPptxSlides, insertTocSlide } = await import("@/lib/pptx-tools");
      const slides = await readPptxSlides(abuf);
      const newData = await insertTocSlide(abuf, slides, insertAfter);
      fs.writeFileSync(abs, Buffer.from(newData));
      return `目次スライドを「${filename}」のスライド${insertAfter}の後に挿入し、上書き保存しました。`;
    }

    default:
      return `不明なツール: ${toolName}`;
  }
}
