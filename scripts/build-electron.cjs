const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
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
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function main() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  console.log("→ Building Next.js (standalone mode)...");
  run(npx, ["next", "build"], {
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

  console.log("→ Removing previous unpacked app bundles (to prevent disk bloat)...");
  safeRm(path.join("dist", "mac"));
  safeRm(path.join("dist", "mac-arm64"));
  safeRm(path.join("dist", "linux-unpacked"));
  safeRm(path.join("dist", "win-unpacked"));

  console.log("→ Packaging with electron-builder...");
  const extraArgs = process.argv.slice(2);
  run(npx, ["electron-builder", ...extraArgs]);

  console.log("✓ Electron build complete.");
}

main();

