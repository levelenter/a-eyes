#!/bin/bash
set -e

echo "→ Building Next.js (standalone mode)..."
ELECTRON_BUILD=1 npx next build

echo "→ Copying static assets into standalone output..."
cp -r .next/static .next/standalone/.next/

if [ -d "public" ]; then
  cp -r public .next/standalone/
fi

echo "→ Packaging with electron-builder..."
npx electron-builder "$@"

echo "✓ Electron build complete."
