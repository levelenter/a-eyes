export type AccessibilityMode = "screen-reader" | "built-in-tts";

export interface AppSettings {
  accessibilityMode: AccessibilityMode | null;
  workingFolder: string | null;
  apiKey: string;
  ttsRate: number;
  ttsVolume: number;
  ttsPitch: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}

export interface AgentTask {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

export interface AgentPlan {
  goal: string;
  tasks: AgentTask[];
  status: "planning" | "executing" | "completed" | "failed";
}
