const { contextBridge } = require("electron");

// Expose minimal platform info to the renderer.
// File operations are handled via Next.js API routes (/api/files, /api/upload, etc.)
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
