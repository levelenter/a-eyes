const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command, args, options = {}) {
  const isWin = process.platform === "win32";
  const result = spawnSync(command, args, {
    stdio: "inherit",
    // Windows では .cmd 実行に shell 経由が必要なため
    shell: isWin,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function safeCp(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function safeRm(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (err) {
    // Windows で稀に EPERM などで削除できないことがあるが、
    // ここはあくまでビルド前のクリーンアップなので、
    // ログだけ出してビルド自体は続行する。
    console.warn(`Warning: failed to remove ${targetPath}:`, err?.message ?? err);
  }
}

function main() {
  const isWin = process.platform === "win32";
  const electronBuilderBin = path.join(
    "node_modules",
    ".bin",
    isWin ? "electron-builder.cmd" : "electron-builder"
  );

  console.log("→ Cleaning previous build artifacts...");
  safeRm(path.join("dist"));
  safeRm(path.join("server", "dist"));

  console.log("→ Building React frontend with Vite...");
  run("npm", ["run", "build"], { env: { ...process.env } });

  console.log("→ Building Node.js server...");
  const serverSrc = path.join("server", "index.cjs");
  if (!fs.existsSync(serverSrc)) {
    console.warn("Warning: server/index.cjs not found; skipping server build step.");
  }

  console.log("→ Removing previous unpacked app bundles (to prevent disk bloat)...");
  safeRm(path.join("dist", "mac"));
  safeRm(path.join("dist", "mac-arm64"));
  safeRm(path.join("dist", "linux-unpacked"));
  safeRm(path.join("dist", "win-unpacked"));

  console.log("→ Packaging with electron-builder...");
  const extraArgs = process.argv.slice(2);
  run(electronBuilderBin, extraArgs);

  console.log("✓ Electron build complete.");
}

main();

