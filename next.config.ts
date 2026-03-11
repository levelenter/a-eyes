import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const isTauriBuild = process.env.TAURI_BUILD === "1";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 1420;

const nextConfig: NextConfig = {
  // Static export only for Tauri production builds.
  // In dev mode (next dev) and web mode, API routes remain available.
  ...(isTauriBuild ? { output: "export" } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  ...(isProd ? {} : { assetPrefix: `http://${internalHost}:${port}` }),
};

export default nextConfig;
