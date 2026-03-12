// Dynamic route: not included in static export (Tauri build)
export const dynamic = "force-dynamic";

/**
 * GET /api/config
 * クライアントにサーバーサイドの設定を返す。
 * WEB_WORKING_FOLDER を公開する（ファイルシステムパスをクライアントに伝えるため）。
 */
export async function GET() {
  const webWorkingFolder = process.env.WEB_WORKING_FOLDER ?? null;
  return Response.json({ webWorkingFolder });
}
