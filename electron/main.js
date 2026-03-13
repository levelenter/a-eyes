const { app, BrowserWindow, shell, utilityProcess, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = 1420;
const isDev = process.env.NODE_ENV !== "production";

let nextServerProcess = null;
let mainWindow = null;

function getUserFilesFolder() {
  const dir = path.join(app.getPath("userData"), "files");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Poll http://127.0.0.1:PORT until it responds or times out. */
function waitForServer(port, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryOnce = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Next.js server did not start within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, 300);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tryOnce();
  });
}

async function startNodeServer() {
  const workingFolder = getUserFilesFolder();

  if (isDev) {
    // 開発時は npm script から server/index.cjs を起動している前提
    await waitForServer(PORT, 120000);
    return;
  }

  const serverPath = path.join(process.resourcesPath, "server", "index.cjs");

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server entry not found at: ${serverPath}`);
  }

  // utilityProcess.fork() is the Electron-recommended way to run a Node.js
  // script from a packaged app — unlike child_process.fork(), it works
  // correctly inside an asar archive.
  nextServerProcess = utilityProcess.fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      WEB_WORKING_FOLDER: workingFolder,
    },
    stdio: "pipe",
  });

  nextServerProcess.on("exit", (code) => {
    console.log("[A-Eyes server] process exited with code", code);
  });

  // Wait until the HTTP server is accepting connections
  await waitForServer(PORT, 120000);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "A-Eyes",
    backgroundColor: "#000000", // prevent white flash before load
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // まずは軽量なローディング画面を表示
  const loadingPath = path.join(__dirname, "loading.html");
  if (fs.existsSync(loadingPath)) {
    await mainWindow.loadFile(loadingPath);
  }

  // バックグラウンドで Node.js サーバーを起動し、準備ができたら本体を読み込む
  try {
    await startNodeServer();
    if (!mainWindow.isDestroyed()) {
      await mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[A-Eyes] Failed to start server:", msg);
    dialog.showErrorBox("起動エラー", `サーバーの起動に失敗しました:\n${msg}`);
    app.quit();
    return;
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (nextServerProcess) {
    nextServerProcess.kill();
    nextServerProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
