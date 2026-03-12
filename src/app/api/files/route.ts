// Dynamic route: not included in static export (Tauri build)
export const dynamic = "force-dynamic";

/**
 * サーバーサイドファイル操作 API (Web版専用)
 *
 * GET  /api/files               → WEB_WORKING_FOLDER 内のファイル一覧
 * GET  /api/files?path=foo.txt  → ファイル内容（テキスト）
 * GET  /api/files?path=foo.pptx&binary=1 → ファイル内容（base64）
 * POST /api/files               → ファイル書き込み { path, content, binary? }
 * DELETE /api/files?path=foo.txt → ファイル削除
 */
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

const WEB_FOLDER = process.env.WEB_WORKING_FOLDER ?? "/tmp/a-eyes-web";

/** パストラバーサル防止: WEB_FOLDER 内に収まるパスを返す */
function resolveSafe(filename: string): string {
  const base = path.resolve(WEB_FOLDER);
  const target = path.resolve(base, filename);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("アクセス拒否: フォルダ外へのアクセスはできません");
  }
  return target;
}

// ─── GET ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    fs.mkdirSync(WEB_FOLDER, { recursive: true });
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    // ファイル一覧
    if (!filePath) {
      const entries = fs.readdirSync(WEB_FOLDER, { withFileTypes: true });
      const items = entries.map((e) => ({
        name: e.name,
        path: e.name,
        isDirectory: e.isDirectory(),
        size: e.isFile()
          ? fs.statSync(path.join(WEB_FOLDER, e.name)).size
          : undefined,
      }));
      return Response.json({ items });
    }

    // ファイル内容
    const abs = resolveSafe(filePath);
    if (!fs.existsSync(abs)) {
      return Response.json({ error: `ファイルが見つかりません: ${filePath}` }, { status: 404 });
    }

    if (searchParams.get("binary") === "1") {
      const buf = fs.readFileSync(abs);
      return Response.json({ content: buf.toString("base64"), binary: true });
    } else {
      const text = fs.readFileSync(abs, "utf-8");
      return Response.json({ content: text });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    fs.mkdirSync(WEB_FOLDER, { recursive: true });
    const body = await req.json() as { path: string; content: string; binary?: boolean };
    const { path: filePath, content, binary } = body;
    if (!filePath || content === undefined) {
      return Response.json({ error: "path と content が必要です" }, { status: 400 });
    }
    const abs = resolveSafe(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });

    if (binary) {
      fs.writeFileSync(abs, Buffer.from(content, "base64"));
    } else {
      fs.writeFileSync(abs, content, "utf-8");
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");
    if (!filePath) {
      return Response.json({ error: "path が必要です" }, { status: 400 });
    }
    const abs = resolveSafe(filePath);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
