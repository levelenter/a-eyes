/**
 * 最小限の有効な 32x32 icon.ico を src-tauri/icons/ に生成する。
 * Windows の Tauri ビルドに必須。
 */
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "src-tauri", "icons");
const outPath = path.join(outDir, "icon.ico");

// ICO header (6 bytes): reserved 0,0, type 1 (icon), count 1
const header = Buffer.from([0, 0, 1, 0, 1, 0]);

// Directory entry (16 bytes): 32x32, 0 colors, 1 plane, 32 bpp, size, offset
const imageDataSize = 40 + 32 * 32 * 4; // BITMAPINFOHEADER + pixels
const dataOffset = 6 + 16;
const entry = Buffer.alloc(16);
entry[0] = 32;  // width
entry[1] = 32;  // height
entry[2] = 0;   // colors
entry[3] = 0;   // reserved
entry.writeUInt16LE(1, 4);   // color planes
entry.writeUInt16LE(32, 6);  // bits per pixel
entry.writeUInt32LE(imageDataSize, 8);
entry.writeUInt32LE(dataOffset, 12);

// BITMAPINFOHEADER (40 bytes)
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);        // header size
dib.writeInt32LE(32, 4);         // width
dib.writeInt32LE(32, 8);         // height (32bpp = no AND mask)
dib.writeUInt16LE(1, 12);        // planes
dib.writeUInt16LE(32, 14);       // bit count
dib.writeUInt32LE(0, 16);        // compression (none)

// 32x32 BGRx pixels (bottom-up), 1 solid color (e.g. dark gray)
const pixels = Buffer.alloc(32 * 32 * 4);
const b = 0x33, g = 0x66, r = 0x99, a = 0xff;
for (let i = 0; i < 32 * 32 * 4; i += 4) {
  pixels[i] = b;
  pixels[i + 1] = g;
  pixels[i + 2] = r;
  pixels[i + 3] = a;
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, entry, dib, pixels]));

console.log("Generated:", outPath);
