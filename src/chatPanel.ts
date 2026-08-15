import * as vscode from "vscode";
import type { ServerManager } from "./server";
import type { SdkClient } from "./sdkClient";
import { buildContextPrompt, getActiveEditorContext } from "./context";
import { PermissionHandler } from "./permissions";
import { openSessionDiff, type OriginalContentProvider } from "./diffs";
import type { DiffDecorations } from "./decorations";
import type { ModelSummary, PanelMessage, ServerState, WebviewRequest } from "./protocol";
import { summarizeSessions } from "./protocol";

const VIEW_TYPE = "opencode.chat";
const ASSISTANT_ROLE = "assistant";
const MODEL_STATE_KEY = "chat.selectedModel";

/**
 * Owns the chat webview: renders messages, streams assistant output from the
 * server event stream and exposes commands to the editor.
 */
export class ChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private sessionID: string | undefined;
  private sessionTitle = "";
  private model: { providerID: string; modelID: string } | undefined;
  private running = false;
  private serverStatus: ServerState = "connecting";
  private modelLabel = "";
  private models: ModelSummary[] = [];

  private readonly assistantIDs = new Set<string>();
  private readonly textParts = new Map<string, Map<string, string>>();
  private readonly toolParts = new Map<string, Map<string, { title: string; status: string }>>();

  private readonly permissionHandler: PermissionHandler;
  private readonly disposables: vscode.Disposable[] = [];

  get currentSessionID(): string | undefined {
    return this.sessionID;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly server: ServerManager,
    private readonly sdk: SdkClient,
    private readonly diffProvider: OriginalContentProvider,
    private readonly diffDecorations: DiffDecorations,
  ) {
    this.permissionHandler = new PermissionHandler(this.sdk);
    this.server.onEvent(this.handleEvent, this, this.disposables);
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "OpenCode",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
      },
    );
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg");

    panel.webview.html = this.getHtml(panel.webview);
    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    panel.webview.onDidReceiveMessage(
      (msg: WebviewRequest) => {
        void this.handleRequest(msg);
      },
      undefined,
      this.disposables,
    );

    await this.init();
  }

  private async init(): Promise<void> {
    await this.resolveModel();
    await this.loadModels();
    const sessions = await this.sdk.listSessions();
    this.post({ type: "sessions", payload: summarizeSessions(sessions) });

    if (!this.sessionID) {
      const session = await this.sdk.createSession();
      if (session) {
        this.sessionID = session.id;
        this.sessionTitle = session.title;
      }
    }
    if (this.sessionID) {
      await this.renderHistory(this.sessionID);
    }
    this.pushStatus();
  }

  private async resolveModel(): Promise<void> {
    if (this.model) {
      return;
    }
    const stored = this.context.globalState.get<ModelSummary | undefined>(MODEL_STATE_KEY);
    if (stored?.providerID && stored?.modelID) {
      this.model = stored;
      this.modelLabel = `${stored.providerID}/${stored.modelID}`;
      return;
    }
    const defaultModel = await this.sdk.defaultModel();
    if (defaultModel) {
      this.model = defaultModel;
      this.modelLabel = `${defaultModel.providerID}/${defaultModel.modelID}`;
    } else {
      this.modelLabel = "no model configured";
    }
  }

  private async loadModels(): Promise<void> {
    const all = await this.sdk.listModels();
    this.models = all.map((m) => ({ providerID: m.providerID, modelID: m.modelID, name: m.name }));
    this.post({ type: "models", payload: this.models });
  }

  private async handleRequest(msg: WebviewRequest): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.pushStatus();
        break;
      case "send":
        await this.send(msg.text);
        break;
      case "newSession":
        await this.newSession();
        break;
      case "selectSession":
        await this.selectSession(msg.id);
        break;
      case "deleteSession":
        await this.deleteSession(msg.id);
        break;
      case "listSessions":
        await this.refreshSessions();
        break;
      case "listModels":
        await this.loadModels();
        break;
      case "selectModel":
        await this.selectModel(msg.providerID, msg.modelID);
        break;
      case "stop":
        await this.stop();
        break;
      case "showChanges":
        if (this.sessionID) {
          await openSessionDiff(
            this.diffProvider,
            this.sdk,
            this.sessionID,
            this.diffDecorations,
          );
        }
        break;
      case "revertMessage":
        if (this.sessionID && msg.messageID) {
          const ok = await this.sdk.revert(this.sessionID, msg.messageID);
          if (ok) {
            this.clearMessageState();
            await this.renderHistory(this.sessionID);
            await this.refreshSessions();
            this.post({ type: "notice", payload: { message: "Changes reverted." } });
            this.pushStatus();
          } else {
            this.post({ type: "error", payload: { message: "Failed to revert message." } });
          }
        }
        break;
      case "referenceActiveFile":
        await this.referenceActiveFile();
        break;
    }
  }

  /** Sends a user message, injecting active editor context. */
  async send(text: string): Promise<void> {
    if (!text.trim() || this.running) {
      return;
    }
    if (!(await this.ensureReady())) {
      return;
    }
    if (!this.model) {
      this.post({ type: "error", payload: { message: "No LLM provider configured for opencode. Run `opencode auth login` in a terminal first." } });
      return;
    }

    const ctx = buildContextPrompt();
    const parts: Array<{ type: "text"; text: string }> = [];
    if (ctx) {
      parts.push({ type: "text", text: ctx });
    }
    parts.push({ type: "text", text });

    this.running = true;
    this.pushStatus();
    this.post({ type: "userMessage", payload: { messageID: `user_${Date.now()}`, text } });
    if (this.sessionID) {
      this.post({ type: "status", payload: { server: this.serverStatus, running: true } });
    }

    const result = await this.sdk.chat(this.sessionID!, { providerID: this.model.providerID, modelID: this.model.modelID, parts });
    if (result?.error) {
      this.post({ type: "error", payload: { message: "The model reported an error. Check the OpenCode output channel." } });
    }
  }

  async sendFromEditor(text: string): Promise<void> {
    if (!this.panel) {
      await this.show();
    }
    this.panel?.reveal();
    await this.send(text);
  }

  async referenceActiveFile(): Promise<void> {
    if (!this.panel) {
      await this.show();
    }
    this.panel?.reveal();
    const ctx = getActiveEditorContext();
    if (!ctx.file) {
      return;
    }
    this.post({ type: "context", payload: { label: ctx.selection ? `${ctx.file} (selection)` : ctx.file } });
  }

  async handleNewSession(): Promise<void> {
    await this.newSession();
  }

  async handleStop(): Promise<void> {
    await this.stop();
  }

  private async ensureReady(): Promise<boolean> {
    if (!this.sessionID) {
      const session = await this.sdk.createSession();
      if (!session) {
        this.post({ type: "error", payload: { message: "Failed to create an opencode session." } });
        return false;
      }
      this.sessionID = session.id;
      this.sessionTitle = session.title;
    }
    return true;
  }

  private async newSession(): Promise<void> {
    const session = await this.sdk.createSession();
    if (!session) {
      return;
    }
    this.sessionID = session.id;
    this.sessionTitle = session.title;
    this.clearMessageState();
    await this.refreshSessions();
    this.post({ type: "history", payload: [] });
    this.pushStatus();
  }

  private async selectSession(id: string): Promise<void> {
    this.sessionID = id;
    this.clearMessageState();
    await this.renderHistory(id);
    await this.refreshSessions();
    this.pushStatus();
  }

  private async selectModel(providerID: string, modelID: string): Promise<void> {
    this.model = { providerID, modelID };
    this.modelLabel = `${providerID}/${modelID}`;
    void this.context.globalState.update(MODEL_STATE_KEY, { providerID, modelID, name: modelID });
    this.pushStatus();
  }

  private async deleteSession(id: string): Promise<void> {
    const ok = await this.sdk.deleteSession(id);
    if (!ok) {
      this.post({ type: "error", payload: { message: `Failed to delete session.` } });
      return;
    }
    if (id === this.sessionID) {
      this.sessionID = undefined;
      this.sessionTitle = "";
      this.clearMessageState();
      const session = await this.sdk.createSession();
      if (session) {
        this.sessionID = session.id;
        this.sessionTitle = session.title;
      }
      await this.renderHistory(this.sessionID ?? id);
    }
    await this.refreshSessions();
    this.post({ type: "notice", payload: { message: `Deleted session.` } });
    this.pushStatus();
  }

  private async renderHistory(sessionID: string): Promise<void> {
    const messages = await this.sdk.getMessages(sessionID);
    const history: Array<{ role: string; messageID: string; text: string; toolCount: number }> = [];
    for (const m of messages) {
      const role = m.info?.role;
      let text = "";
      let toolCount = 0;
      for (const part of m.parts ?? []) {
        if (part.type === "text") {
          text += part.text ?? "";
        } else if (part.type === "tool") {
          toolCount++;
        }
      }
      if (role === ASSISTANT_ROLE || text.trim()) {
        history.push({ role: role === ASSISTANT_ROLE ? ASSISTANT_ROLE : "user", messageID: m.info.id, text, toolCount });
      }
    }
    this.post({ type: "history", payload: history });
  }

  private async refreshSessions(): Promise<void> {
    const sessions = await this.sdk.listSessions();
    this.post({ type: "sessions", payload: summarizeSessions(sessions) });
  }

  private async stop(): Promise<void> {
    if (this.sessionID) {
      await this.sdk.abort(this.sessionID);
    }
    this.running = false;
    this.pushStatus();
  }

  private clearMessageState(): void {
    this.assistantIDs.clear();
    this.textParts.clear();
    this.toolParts.clear();
    this.running = false;
  }

  /**
   * Handles events from the opencode server event stream.
   */
  private async handleEvent(event: unknown): Promise<void> {
    if (!event || typeof event !== "object") {
      return;
    }
    const { type, properties } = event as { type: string; properties: Record<string, unknown> };

    if (type === "permission.updated") {
      await this.permissionHandler.handle(event);
      return;
    }

    const sessionID = (properties as { sessionID?: string })?.sessionID;
    if (sessionID && sessionID !== this.sessionID) {
      return;
    }

    switch (type) {
      case "message.updated": {
        const info = properties.info as { role: string; id: string; time?: { completed?: number }; error?: unknown };
        if (info.role === ASSISTANT_ROLE) {
          this.assistantIDs.add(info.id);
          if (info.time?.completed) {
            this.running = false;
          }
          this.pushStatus();
        }
        break;
      }
      case "message.part.updated": {
        const part = properties.part as { type: string; messageID: string; id: string; text?: string; tool?: string; callID?: string; state?: { status: string; title?: string } };
        if (!part) {
          break;
        }
        if (part.type === "text" && this.assistantIDs.has(part.messageID)) {
          let parts = this.textParts.get(part.messageID);
          if (!parts) {
            parts = new Map();
            this.textParts.set(part.messageID, parts);
          }
          parts.set(part.id, part.text ?? "");
          const full = Array.from(parts.values()).join("");
          this.post({ type: "delta", payload: { messageID: part.messageID, text: full } });
        } else if (part.type === "tool") {
          let tools = this.toolParts.get(part.messageID);
          if (!tools) {
            tools = new Map();
            this.toolParts.set(part.messageID, tools);
          }
          tools.set(part.callID ?? part.id, {
            title: part.state?.title ?? part.tool ?? "tool",
            status: part.state?.status ?? "running",
          });
          this.post({
            type: "tool",
            payload: { messageID: part.messageID, callID: part.callID ?? part.id, title: part.state?.title ?? part.tool ?? "tool", status: part.state?.status ?? "running" },
          });
        }
        break;
      }
      case "session.updated": {
        const info = properties.info as { id?: string; title?: string };
        if (info?.id === this.sessionID && info.title) {
          this.sessionTitle = info.title;
          this.pushStatus();
        }
        break;
      }
      case "session.idle": {
        this.running = false;
        this.pushStatus();
        break;
      }
      case "session.error": {
        const error = properties.error as { name?: string; data?: { message?: string } } | undefined;
        this.post({
          type: "error",
          payload: { message: error?.data?.message ?? `Session error: ${error?.name ?? "unknown"}` },
        });
        this.running = false;
        this.pushStatus();
        break;
      }
    }
  }

  updateServerStatus(status: ServerState): void {
    this.serverStatus = status;
    this.pushStatus();
  }

  private pushStatus(): void {
    if (!this.panel) {
      return;
    }
    this.post({
      type: "status",
      payload: { server: this.serverStatus, sessionID: this.sessionID, running: this.running, model: this.modelLabel },
    });
  }

  private post(message: PanelMessage): void {
    this.panel?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.css"));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.js"));
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${cssUri}" />
</head>
<body>
<header id="header">
  <div class="brand">
    <img src="${iconUri}" alt="OpenCode" />
    <span id="session-title">OpenCode</span>
  </div>
  <div id="header-actions">
    <button id="model-label" title="Model"></button>
    <button id="btn-sessions" title="Sessions">${SVG_SESSIONS}</button>
    <button id="btn-new" title="New session">${SVG_NEW}</button>
    <button id="btn-stop" title="Stop" disabled>${SVG_STOP}</button>
  </div>
</header>
<main id="messages" tabindex="0"></main>
<div id="context-bar"></div>
<footer id="input-bar">
  <textarea id="input" rows="1" placeholder="Ask OpenCode to write or change code… (Enter to send, Shift+Enter for new line)"></textarea>
  <button id="btn-send" title="Send">${SVG_SEND}</button>
</footer>
<script src="${jsUri}"></script>
</body>
</html>`;
  }
}

const SVG_SEND = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M1.5 8L14 1.5 9.8 8l4.2 6.5L1.5 8z"/></svg>';
const SVG_NEW = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.5"/></svg>';
const SVG_STOP = '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="3" width="10" height="10" fill="currentColor"/></svg>';
const SVG_SESSIONS = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h12v10H2zM5 6h6M5 8.5h6M5 11h4" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
