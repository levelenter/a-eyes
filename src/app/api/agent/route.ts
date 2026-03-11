/**
 * Agent API route.
 * Available only in Next.js server mode (next dev / SSR).
 * NOT available in static export mode (Tauri production build).
 *
 * Uses @anthropic-ai/sdk directly (server-side) with SSE streaming.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { FILE_TOOLS, executeTool } from "@/lib/agent-tools";

const MODEL = "claude-sonnet-4-6";

interface AgentRequest {
  prompt: string;
  apiKey: string;
  cwd?: string;
  systemPrompt?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AgentRequest;
  const { prompt, apiKey, systemPrompt, cwd } = body;

  if (!prompt || !apiKey) {
    return new Response(JSON.stringify({ error: "prompt and apiKey are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const client = new Anthropic({ apiKey });

        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: prompt },
        ];

        let iteration = 0;
        while (iteration < 10) {
          iteration++;

          // Stream the response for real-time text delivery
          const stream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: systemPrompt ?? "",
            messages,
            tools: FILE_TOOLS,
          });

          // Forward text chunks as they arrive
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              send({ type: "text", text: event.delta.text });
            } else if (
              event.type === "content_block_start" &&
              event.content_block.type === "tool_use"
            ) {
              send({ type: "tool_use", name: event.content_block.name });
            }
          }

          const response = await stream.finalMessage();

          if (response.stop_reason !== "tool_use") break;

          // Execute tool calls
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          if (toolUseBlocks.length === 0) break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const toolUse of toolUseBlocks) {
            try {
              const result = await executeTool(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                { workingFolder: cwd ?? null, selectedFile: null }
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: result,
              });
            } catch (err) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: `エラー: ${err instanceof Error ? err.message : String(err)}`,
                is_error: true,
              });
            }
          }

          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[/api/agent] error:", errMsg);
        send({ type: "error", error: errMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
