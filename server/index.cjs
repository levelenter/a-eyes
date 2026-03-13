const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 1420;

app.use(express.json());

// ─── Static frontend (built by Vite) ────────────────────────────────
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// ─── Shared helpers ─────────────────────────────────────────────────

const WEB_FOLDER = process.env.WEB_WORKING_FOLDER || path.join(process.cwd(), "web-files");

function ensureWebFolder() {
  fs.mkdirSync(WEB_FOLDER, { recursive: true });
}

function resolveSafe(filename) {
  const base = path.resolve(WEB_FOLDER);
  const target = path.resolve(base, filename);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("アクセス拒否: フォルダ外へのアクセスはできません");
  }
  return target;
}

// ─── API: /api/config ──────────────────────────────────────────────

app.get("/api/config", (_req, res) => {
  // フロント側には、実際にサーバーがファイルを保存している WEB_FOLDER をそのまま知らせる
  // （表示やコンテキスト用であり、パスそのものは API 側でガードされる）
  const webWorkingFolder = WEB_FOLDER;
  console.log("[api/config] webWorkingFolder =", webWorkingFolder);
  res.json({ webWorkingFolder });
});

// ─── API: /api/files ───────────────────────────────────────────────

app.get("/api/files", (req, res) => {
  try {
    ensureWebFolder();
    const filePath = req.query.path;

    // 一覧
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
      console.log(`[api/files] list -> ${items.length} items in ${WEB_FOLDER}`);
      res.json({ items });
      return;
    }

    const abs = resolveSafe(String(filePath));
    if (!fs.existsSync(abs)) {
      res.status(404).json({ error: `ファイルが見つかりません: ${filePath}` });
      return;
    }

    if (req.query.binary === "1") {
      const buf = fs.readFileSync(abs);
      res.json({ content: buf.toString("base64"), binary: true });
    } else {
      const text = fs.readFileSync(abs, "utf-8");
      res.json({ content: text });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/files", (req, res) => {
  try {
    ensureWebFolder();
    const body = req.body || {};
    const filePath = body.path;
    const content = body.content;
    const binary = !!body.binary;

    if (!filePath || content === undefined) {
      res.status(400).json({ error: "path と content が必要です" });
      return;
    }

    const abs = resolveSafe(String(filePath));
    fs.mkdirSync(path.dirname(abs), { recursive: true });

    if (binary) {
      fs.writeFileSync(abs, Buffer.from(String(content), "base64"));
    } else {
      fs.writeFileSync(abs, String(content), "utf-8");
    }

    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.delete("/api/files", (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      res.status(400).json({ error: "path が必要です" });
      return;
    }
    const abs = resolveSafe(String(filePath));
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ─── API: /api/upload ──────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/upload", upload.any(), (req, res) => {
  try {
    ensureWebFolder();
    const files = req.files || [];
    const saved = [];

    for (const file of files) {
      const filename = path.basename(file.originalname || file.fieldname);
      const dest = path.join(WEB_FOLDER, filename);
      fs.writeFileSync(dest, file.buffer);
      saved.push(filename);
    }

    console.log(`[api/upload] saved ${saved.length} files to ${WEB_FOLDER}:`, saved);
    res.json({ saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ─── Fallback: SPA routing support ─────────────────────────────────

app.get("*", (_req, res) => {
  const indexHtml = path.join(distDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res
      .status(500)
      .send("Frontend is not built yet. Please run `npm run build` first.");
  }
});

app.listen(PORT, () => {
  console.log(`A-Eyes server listening on http://127.0.0.1:${PORT}`);
});

