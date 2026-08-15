import type { Session } from "@opencode-ai/sdk";

export interface SessionSummary {
  id: string;
  title: string;
}

export interface ModelSummary {
  providerID: string;
  modelID: string;
  name: string;
}

export type ServerState = "connecting" | "connected" | "disconnected" | "error";

/** Messages sent from the webview to the extension host. */
export type WebviewRequest =
  | { type: "ready" }
  | { type: "send"; text: string }
  | { type: "newSession" }
  | { type: "selectSession"; id: string }
  | { type: "deleteSession"; id: string }
  | { type: "listSessions" }
  | { type: "listModels" }
  | { type: "selectModel"; providerID: string; modelID: string }
  | { type: "stop" }
  | { type: "showChanges" }
  | { type: "revertMessage"; messageID: string }
  | { type: "referenceActiveFile" };

/** Messages sent from the extension host to the webview. */
export type PanelMessage =
  | { type: "state"; payload: { sessionID?: string; title?: string; server: ServerState; model?: string; running: boolean } }
  | { type: "sessions"; payload: SessionSummary[] }
  | { type: "models"; payload: ModelSummary[] }
  | { type: "history"; payload: Array<{ role: string; messageID: string; text: string; toolCount: number }> }
  | { type: "userMessage"; payload: { messageID: string; text: string } }
  | { type: "assistant"; payload: { messageID: string; text: string; tools: Array<{ title: string; status: string }> } }
  | { type: "delta"; payload: { messageID: string; text: string } }
  | { type: "tool"; payload: { messageID: string; callID: string; title: string; status: string } }
  | { type: "context"; payload: { label: string } }
  | { type: "status"; payload: { server: ServerState; sessionID?: string; running: boolean; model?: string } }
  | { type: "notice"; payload: { message: string } }
  | { type: "error"; payload: { message: string } };

export interface ChatPanelHandle {
  show(): Promise<void>;
  sendFromEditor(text: string): Promise<void>;
  referenceActiveFile(): Promise<void>;
  updateServerStatus(status: ServerState): Promise<void>;
  dispose(): void;
}

export function summarizeSessions(sessions: Session[]): SessionSummary[] {
  return sessions.map((s) => ({
    id: s.id,
    title: s.title || `Session ${s.id.slice(0, 8)}`,
  }));
}
