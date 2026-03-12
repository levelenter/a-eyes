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

  // 前回ビルドで生成された .next/standalone を削除しておかないと
  // 新しい standalone 内に古い standalone がそのまま取り込まれ、
  // ビルドするたびにサイズが倍々に増えてしまう。
  const standaloneDir = path.join(".next", "standalone");
  safeRm(standaloneDir);
  const nextBin = path.join(
    "node_modules",
    ".bin",
    isWin ? "next.cmd" : "next"
  );
  const electronBuilderBin = path.join(
    "node_modules",
    ".bin",
    isWin ? "electron-builder.cmd" : "electron-builder"
  );

  console.log("→ Building Next.js (standalone mode)...");
  run(nextBin, ["build"], {
    env: {
      ...process.env,
      ELECTRON_BUILD: "1",
    },
  });

  console.log("→ Copying static assets into standalone output...");
  const staticSrc = path.join(".next", "static");
  const staticDest = path.join(".next", "standalone", ".next", "static");
  safeCp(staticSrc, staticDest);

  const publicSrc = path.join("public");
  const publicDest = path.join(".next", "standalone", "public");
  safeCp(publicSrc, publicDest);

  // .next/standalone 内の node_modules から devDependencies を削除してサイズ削減
  // （package-lock.json に基づき npm が dev フラグ付き依存を落としてくれる想定）
  const lockPath = path.join(standaloneDir, "package-lock.json");
  if (fs.existsSync(lockPath)) {
    console.log("→ Pruning devDependencies from standalone node_modules...");
    run("npm", ["prune", "--production"], { cwd: standaloneDir });
  } else {
    console.log(
      "→ Skip npm prune: package-lock.json not found in .next/standalone"
    );
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

