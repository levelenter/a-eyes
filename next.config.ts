import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 1420;

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri expects a static export
  trailingSlash: true,
  // Tauri dev: assetPrefix for proper asset resolution
  ...(isProd ? {} : { assetPrefix: `http://${internalHost}:${port}` }),
};

export default nextConfig;
