import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // standalone output for Electron production builds
  ...(process.env.ELECTRON_BUILD === "1"
    ? {
        output: "standalone",
        // Ensure standalone output is at .next/standalone/ (not nested in full path)
        outputFileTracingRoot: path.join(__dirname),
      }
    : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
