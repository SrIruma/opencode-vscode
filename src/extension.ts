import * as vscode from "vscode";
import { getConfig } from "./config";
import { ServerManager } from "./server";
import { SdkClient } from "./sdkClient";
import { OriginalContentProvider } from "./diffs";
import { DiffDecorations } from "./decorations";
import { ChatPanel } from "./chatPanel";
import { getOutputChannel, log } from "./logger";

let server: ServerManager;
let sdk: SdkClient;
let chatPanel: ChatPanel;
let diffProvider: OriginalContentProvider;
let diffDecorations: DiffDecorations;
let statusBar: vscode.StatusBarItem;

async function ensureServer(): Promise<boolean> {
  const ok = await server.ensureRunning();
  chatPanel.updateServerStatus(server.currentStatus);
  if (ok) {
    statusBar.text = "$(circuit-board) OpenCode";
    statusBar.tooltip = "OpenCode server: connected";
  } else {
    statusBar.text = "$(circuit-board) OpenCode: offline";
    statusBar.tooltip = "OpenCode server unavailable. Click to retry.";
  }
  return ok;
}

async function openChat(): Promise<void> {
  await ensureServer();
  await chatPanel.show();
}

async function newSession(): Promise<void> {
  await ensureServer();
  await chatPanel.show();
  await chatPanel.handleNewSession();
}

async function sendSelection(): Promise<void> {
  await ensureServer();
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showInformationMessage("OpenCode: select some text in the editor first.");
    return;
  }
  const text = editor.document.getText(editor.selection);
  await chatPanel.sendFromEditor(text);
}

async function referenceActiveFile(): Promise<void> {
  await ensureServer();
  await chatPanel.referenceActiveFile();
}

async function stopSession(): Promise<void> {
  await chatPanel.handleStop();
}

async function showChanges(): Promise<void> {
  await ensureServer();
  const sessionID = chatPanel.currentSessionID;
  if (!sessionID) {
    vscode.window.showInformationMessage("OpenCode: open a session first.");
    return;
  }
  const { openSessionDiff } = await import("./diffs");
  await openSessionDiff(diffProvider, sdk, sessionID, diffDecorations);
}

async function clearDecorations(): Promise<void> {
  diffDecorations.clearAll();
  vscode.window.showInformationMessage("OpenCode: change highlights cleared.");
}

async function reconnectServer(): Promise<void> {
  chatPanel.updateServerStatus("connecting");
  await ensureServer();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  getOutputChannel();
  log("OpenCode extension activating.");

  diffProvider = new OriginalContentProvider();
  diffDecorations = new DiffDecorations();
  server = new ServerManager(context);
  sdk = new SdkClient(server.getClient(), server.url);
  chatPanel = new ChatPanel(context, server, sdk, diffProvider, diffDecorations);

  server.onStatus((status) => {
    chatPanel.updateServerStatus(status);
    if (status === "connected") {
      statusBar.text = "$(circuit-board) OpenCode";
      statusBar.tooltip = "OpenCode server: connected — click to open chat";
    } else if (status === "connecting") {
      statusBar.text = "$(sync~spin) OpenCode";
      statusBar.tooltip = "OpenCode server: connecting…";
    } else {
      statusBar.text = "$(circuit-board) OpenCode: offline";
      statusBar.tooltip = "OpenCode server unavailable — click to reconnect";
    }
  });

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  statusBar.text = "$(circuit-board) OpenCode";
  statusBar.command = "opencode.openChat";
  statusBar.show();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.openChat", openChat),
    vscode.commands.registerCommand("opencode.newSession", newSession),
    vscode.commands.registerCommand("opencode.sendSelection", sendSelection),
    vscode.commands.registerCommand("opencode.referenceActiveFile", referenceActiveFile),
    vscode.commands.registerCommand("opencode.stopSession", stopSession),
    vscode.commands.registerCommand("opencode.showDiff", showChanges),
    vscode.commands.registerCommand("opencode.clearDecorations", clearDecorations),
    vscode.commands.registerCommand("opencode.reconnectServer", reconnectServer),
    vscode.workspace.registerTextDocumentContentProvider("opencode-diff", diffProvider),
    vscode.window.onDidChangeActiveTextEditor(() => diffDecorations.applyToActive()),
    vscode.workspace.onDidCloseTextDocument((doc) => diffDecorations.clear(doc.uri.fsPath)),
    vscode.workspace.onDidChangeTextDocument((e) => diffDecorations.clear(e.document.uri.fsPath)),
    diffDecorations,
  );

  const cfg = getConfig();
  if (cfg.autoStart) {
    void ensureServer();
  }
}

export function deactivate(): void {
  log("OpenCode extension deactivating.");
  void server.dispose();
}

/** Test-only access to internal singletons. */
export const __internals = {
  get server(): ServerManager {
    return server;
  },
  get sdk(): SdkClient {
    return sdk;
  },
  get chatPanel(): ChatPanel {
    return chatPanel;
  },
  get diffProvider(): OriginalContentProvider {
    return diffProvider;
  },
  get diffDecorations(): DiffDecorations {
    return diffDecorations;
  },
};
