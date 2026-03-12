// Dynamic route: not included in static export (Tauri build)
export const dynamic = "force-dynamic";

/**
 * POST /api/upload
 * ブラウザからマルチパートでファイルをアップロードして WEB_WORKING_FOLDER に保存する。
 */
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

const WEB_FOLDER = process.env.WEB_WORKING_FOLDER ?? "/tmp/a-eyes-web";

export async function POST(req: NextRequest) {
  try {
    fs.mkdirSync(WEB_FOLDER, { recursive: true });

    const formData = await req.formData();
    const saved: string[] = [];

    for (const [, value] of formData.entries()) {
      if (typeof value === "string") continue;
      const file = value as File;
      const filename = path.basename(file.name); // パストラバーサル防止
      const dest = path.join(WEB_FOLDER, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      saved.push(filename);
    }

    return Response.json({ saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
