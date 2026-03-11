import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri expects a static export
  trailingSlash: true,
};

export default nextConfig;
