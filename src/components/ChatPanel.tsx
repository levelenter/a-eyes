"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, AgentPlan } from "@/types";
import { streamAgentResponse } from "@/lib/claude-agent";

interface Props {
  messages: Message[];
  onAddMessage: (msg: Message) => void;
  onUpdateMessage: (id: string, content: string, streaming: boolean) => void;
  workingFolder: string | null;
  fileNames: string[];
  selectedFile?: string | null;
  apiKey: string;
  onSpeak: (text: string) => void;
  onPlan?: (plan: AgentPlan) => void;
  onOpenSettings: () => void;
}

export default function ChatPanel({
  messages,
  onAddMessage,
  onUpdateMessage,
  workingFolder,
  fileNames,
  selectedFile,
  apiKey,
  onSpeak,
  onPlan,
  onOpenSettings,
}: Props) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<"auth" | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    if (!apiKey) {
      onSpeak("APIキーが設定されていません。設定パネルで入力してください。");
      onOpenSettings();
      return;
    }

    setLastError(null);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    onAddMessage(userMsg);
    setInput("");
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    onAddMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    });

    try {
      let fullContent = "";
      for await (const chunk of streamAgentResponse(
        [...messages, userMsg],
        apiKey,
        { workingFolder, files: fileNames, selectedFile }
      )) {
        fullContent += chunk;
        onUpdateMessage(assistantId, fullContent, true);
      }
      onUpdateMessage(assistantId, fullContent, false);
      onSpeak(fullContent.replace(/[*#`]/g, "").trim());
    } catch (err) {
      const isAuth = isAuthError(err);
      if (isAuth) setLastError("auth");
      const errMsg = friendlyError(err);
      onUpdateMessage(assistantId, errMsg, false);
      onSpeak(errMsg);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Messages */}
      <div
        role="log"
        aria-label="会話履歴"
        aria-live="polite"
        aria-atomic="false"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-xl mb-2">A-Eyes</p>
            <p className="text-sm">何でもご質問ください。ファイルの操作もお手伝いします。</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onOpenSettings={onOpenSettings} />
        ))}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {/* Auth error banner */}
      {lastError === "auth" && (
        <div
          role="alert"
          className="mx-4 mb-2 px-4 py-3 bg-red-900/60 border border-red-700 rounded-lg flex items-center justify-between gap-3"
        >
          <p className="text-red-300 text-sm">
            APIキーが無効または期限切れです
          </p>
          <button
            onClick={onOpenSettings}
            className="shrink-0 px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg"
          >
            設定を開く
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t-2 border-gray-700 p-4 bg-gray-900"
        aria-label="メッセージ入力フォーム"
      >
        {isLoading && (
          <div aria-live="polite" className="text-yellow-400 text-sm mb-2 flex items-center gap-2">
            <span className="animate-spin inline-block">⟳</span>
            AIが応答を生成中...
          </div>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力... (Cmd+Enter で送信)"
            rows={3}
            disabled={isLoading}
            aria-label="メッセージ入力欄"
            className="flex-1 bg-gray-800 text-white border-2 border-gray-600 focus:border-yellow-400 rounded-lg p-3 resize-none text-sm disabled:opacity-50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="送信"
            className="px-5 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-lg transition-colors text-sm h-[72px]"
          >
            送信
          </button>
        </div>
        {!apiKey && (
          <p className="text-red-400 text-xs mt-2" role="alert">
            APIキーが未設定です。
            <button onClick={onOpenSettings} className="underline ml-1 hover:text-red-300">
              設定を開く
            </button>
          </p>
        )}
      </form>
    </div>
  );
}

function isAuthError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.includes("401") || raw.includes("authentication_error") || raw.includes("invalid x-api-key");
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (isAuthError(err)) {
    return "APIキーが無効または期限切れです。設定からキーを確認・更新してください。";
  }
  if (raw.includes("429") || raw.includes("rate_limit")) {
    return "APIのレート制限に達しました。しばらく待ってから再試行してください。";
  }
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("Failed to fetch")) {
    return "ネットワークエラーです。インターネット接続を確認してください。";
  }
  return "エラーが発生しました。しばらく待ってから再試行してください。";
}

function MessageBubble({
  message,
  onOpenSettings,
}: {
  message: Message;
  onOpenSettings: () => void;
}) {
  const isUser = message.role === "user";
  const isAuthErr =
    !isUser &&
    (message.content.includes("APIキーが無効") || message.content.includes("authentication_error"));

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-yellow-500 text-black"
            : "bg-gray-800 text-gray-100 border border-gray-700"
        } ${message.isStreaming ? "border-l-4 border-l-yellow-400" : ""}`}
      >
        {!isUser && <div className="text-xs text-gray-400 mb-1">A-Eyes</div>}
        {message.content || (message.isStreaming ? "▋" : "")}
        {isAuthErr && (
          <button
            onClick={onOpenSettings}
            className="mt-2 block px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg"
          >
            設定を開いてキーを更新
          </button>
        )}
      </div>
    </div>
  );
}
