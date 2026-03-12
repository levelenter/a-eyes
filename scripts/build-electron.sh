#!/bin/bash
set -e

echo "→ Building Next.js (standalone mode)..."
ELECTRON_BUILD=1 npx next build

echo "→ Copying static assets into standalone output..."
cp -r .next/static .next/standalone/.next/

if [ -d "public" ]; then
  cp -r public .next/standalone/
fi

echo "→ Removing previous unpacked app bundles (to prevent disk bloat)..."
rm -rf dist/mac dist/mac-arm64 dist/linux-unpacked dist/win-unpacked

echo "→ Packaging with electron-builder..."
npx electron-builder "$@"

echo "✓ Electron build complete."
