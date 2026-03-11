import Anthropic from "@anthropic-ai/sdk";
import type { Message, AgentPlan, AgentTask } from "@/types";

export interface AgentContext {
  workingFolder: string | null;
  files: string[];
}

const MODEL = "claude-opus-4-6";

export async function* streamAgentResponse(
  messages: Message[],
  apiKey: string,
  context: AgentContext,
  onPlan?: (plan: AgentPlan) => void
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = buildSystemPrompt(context);

  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // First, get a plan if this seems like a complex task
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  if (lastUserMessage && isComplexTask(lastUserMessage.content)) {
    const plan = await createPlan(client, lastUserMessage.content, context, apiKey);
    if (onPlan) onPlan(plan);
    yield `**計画を立てました:**\n${plan.tasks.map((t, i) => `${i + 1}. ${t.description}`).join("\n")}\n\n**実行開始...**\n\n`;
  }

  // Stream the main response
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}

function buildSystemPrompt(context: AgentContext): string {
  const folderInfo = context.workingFolder
    ? `現在の作業フォルダ: ${context.workingFolder}\n利用可能なファイル: ${context.files.join(", ") || "なし"}`
    : "作業フォルダが設定されていません。";

  return `あなたはA-Eyes、視覚障害者向けのAIアシスタントです。
ユーザーがファイル操作やコンテンツ編集を音声で確認しながら作業できるよう、丁寧で明確なサポートを提供します。

${folderInfo}

重要なガイドライン:
- 回答は明確で簡潔に。スクリーンリーダーで読みやすいよう、不要な記号を避ける。
- ファイル操作を行う際は、必ず操作内容を説明してから実行する。
- PowerPointの編集では、スライドの構造と変更点を詳しく説明する。
- 複雑なタスクは段階に分けて実行し、各ステップの結果を報告する。
- 日本語で回答する。`;
}

function isComplexTask(prompt: string): boolean {
  const complexKeywords = [
    "作成", "編集", "修正", "変更", "追加", "削除",
    "整理", "まとめ", "分析", "比較", "変換"
  ];
  return complexKeywords.some((k) => prompt.includes(k)) && prompt.length > 30;
}

async function createPlan(
  client: Anthropic,
  goal: string,
  context: AgentContext,
  _apiKey: string
): Promise<AgentPlan> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `以下のタスクを実行するための具体的な手順を3〜5ステップでリストアップしてください。JSON形式で回答してください。
タスク: ${goal}
作業フォルダ: ${context.workingFolder ?? "未設定"}

回答形式:
{"tasks": [{"description": "ステップの説明"}, ...]}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    return { goal, tasks: [], status: "planning" };
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    const tasks: AgentTask[] = (parsed.tasks ?? []).map(
      (t: { description: string }, i: number) => ({
        id: `task-${i}`,
        description: t.description,
        status: "pending" as const,
      })
    );
    return { goal, tasks, status: "planning" };
  } catch {
    return { goal, tasks: [{ id: "task-0", description: goal, status: "pending" }], status: "planning" };
  }
}
