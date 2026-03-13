import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@/types";
import { FILE_TOOLS, executeTool, type ToolContext } from "@/lib/agent-tools";

export interface AgentContext {
  workingFolder: string | null;
  files: string[];
  selectedFile?: string | null;
}

const MODEL = "claude-opus-4-6";

/**
 * Returns true when running inside a Next.js dev/server environment
 * where the /api/agent route is reachable.
 *
 * file:// = Tauri production static export (no API routes)
 * http:// = Tauri dev mode (next dev) OR web → API routes available
 */
function canUseApiRoute(): boolean {
  // Next.js サーバーモード用の経路は廃止し、
  // 常にブラウザSDK＋ファイルツール経由で動作させる。
  return false;
}

/**
 * Agentic response loop — routes to Agent SDK (via API route) or
 * the in-browser Anthropic SDK depending on the runtime environment.
 */
export async function* streamAgentResponse(
  messages: Message[],
  apiKey: string,
  context: AgentContext
): AsyncGenerator<string> {
  if (canUseApiRoute()) {
    yield* streamViaApiRoute(messages, apiKey, context);
  } else {
    yield* streamViaBrowserSdk(messages, apiKey, context);
  }
}

// ─────────────────────────────────────────────
// Agent SDK path (Next.js dev / server mode)
// ─────────────────────────────────────────────

async function* streamViaApiRoute(
  messages: Message[],
  apiKey: string,
  context: AgentContext
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(context);

  // Include recent conversation history as context inside the system prompt
  const history = messages
    .filter((m) => m.role !== "system" && m.content)
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const lastUserMsg =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const fullSystemPrompt = history
    ? `${systemPrompt}\n\n## 会話履歴\n${history}`
    : systemPrompt;

  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: lastUserMsg,
      apiKey,
      cwd: context.workingFolder ?? undefined,
      systemPrompt: fullSystemPrompt,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`/api/agent responded with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue; // malformed line — skip
      }

      if (msg.type === "text" && typeof msg.text === "string") {
        yield msg.text;
      } else if (msg.type === "tool_use" && typeof msg.name === "string") {
        yield `\n🔧 **${msg.name}** を実行中...\n`;
      } else if (msg.type === "done") {
        return;
      } else if (msg.type === "error") {
        throw new Error(String(msg.error ?? "Unknown error from /api/agent"));
      }
    }
  }
}

// ─────────────────────────────────────────────
// Browser Anthropic SDK path (Tauri static / web fallback)
// ─────────────────────────────────────────────

async function* streamViaBrowserSdk(
  messages: Message[],
  apiKey: string,
  context: AgentContext
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const systemPrompt = buildSystemPrompt(context);

  const apiMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  let iteration = 0;
  while (iteration < 10) {
    iteration++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
      tools: FILE_TOOLS,
    });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        yield block.text;
      }
    }

    if (response.stop_reason !== "tool_use") break;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUseBlocks.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      yield `\n🔧 **${toolUse.name}** を実行中...\n`;

      const toolCtx: ToolContext = {
        workingFolder: context.workingFolder,
        selectedFile: context.selectedFile ?? null,
      };

      try {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolCtx
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
        yield `✓ 完了\n`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `エラー: ${msg}`,
          is_error: true,
        });
        yield `✗ エラー: ${msg}\n`;
      }
    }

    apiMessages.push({ role: "assistant", content: response.content });
    apiMessages.push({ role: "user", content: toolResults });
  }
}

// ─────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────

function buildSystemPrompt(context: AgentContext): string {
  const folderLine = context.workingFolder
    ? `現在の作業フォルダ: ${context.workingFolder}`
    : "作業フォルダが設定されていません。";

  const filesLine =
    context.files.length > 0
      ? `利用可能なファイル: ${context.files.join(", ")}`
      : "（ファイルなし）";

  const selectedLine = context.selectedFile
    ? `現在選択中のファイル: ${context.selectedFile}`
    : "";

  const contextSection = [folderLine, filesLine, selectedLine]
    .filter(Boolean)
    .join("\n");

  return `あなたはA-Eyes、視覚障害者向けのAIファイル操作アシスタントです。
ユーザーがファイル操作やコンテンツ編集を音声で確認しながら作業できるよう、丁寧で明確なサポートを提供します。

${contextSection}

## 重要なガイドライン
- ユーザーが「このファイル」と言ったら「現在選択中のファイル」を指します。
- ファイル操作は必ずツールを使って実際に実行してください。説明だけで終わらせず、実際にファイルを変更します。
- 操作前に何をするか簡潔に説明し、完了後も結果を報告してください。
- スクリーンリーダーで読みやすいよう、装飾的な記号は最小限にしてください。
- 日本語で回答してください。`;
}
