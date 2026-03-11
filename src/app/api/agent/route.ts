/**
 * Agent SDK API route.
 * Available only in Next.js server mode (next dev / SSR).
 * NOT available in static export mode (Tauri production build).
 *
 * Streams responses from the @anthropic-ai/claude-agent-sdk via SSE.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { NextRequest } from "next/server";

interface AgentRequest {
  prompt: string;
  apiKey: string;
  cwd?: string;
  systemPrompt?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AgentRequest;
  const { prompt, apiKey, cwd, systemPrompt } = body;

  if (!prompt || !apiKey) {
    return new Response(JSON.stringify({ error: "prompt and apiKey are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const agentQuery = query({
          prompt,
          options: {
            cwd: cwd ?? process.cwd(),
            ...(systemPrompt ? { systemPrompt } : {}),
            // Allow file read/write/edit and shell for complex ops (e.g. PPTX via script)
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            env: (() => {
              // CLAUDECODE env var causes "nested session" rejection — strip it
              const { CLAUDECODE: _cc, ...rest } = process.env;
              return { ...rest, ANTHROPIC_API_KEY: apiKey };
            })(),
            persistSession: false,
            maxTurns: 15,
          },
        });

        for await (const msg of agentQuery) {
          console.log("[/api/agent] msg:", msg.type, JSON.stringify(msg).slice(0, 300));
          if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "text" && block.text.trim()) {
                send({ type: "text", text: block.text });
              } else if (block.type === "tool_use") {
                send({ type: "tool_use", name: block.name });
              }
            }
          } else if (msg.type === "result") {
            if (msg.is_error) {
              const errText =
                "errors" in msg
                  ? (msg.errors as string[]).join("; ")
                  : "result" in msg
                  ? String((msg as { result: string }).result)
                  : "Unknown error";
              send({ type: "error", error: errText });
            }
            break;
          }
        }

        send({ type: "done" });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[/api/agent] error:", e);
        send({ type: "error", error: errMsg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
