import * as path from "path";
import * as vscode from "vscode";
import type { SdkClient, DiffFile } from "./sdkClient";
import { reverseApplyPatch } from "./patch";
import { log } from "./logger";

const SCHEME = "opencode-diff";

/**
 * Serves "original" versions of changed files as virtual documents so the real
 * VS Code diff editor can be used (`vscode.diff`).
 */
export class OriginalContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange.event;

  static toUri(filePath: string): vscode.Uri {
    return vscode.Uri.from({
      scheme: SCHEME,
      authority: "original",
      path: "/" + filePath.replace(/^[/\\]+/, ""),
    });
  }

  setContent(filePath: string, content: string): void {
    const uri = OriginalContentProvider.toUri(filePath);
    this.contents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  getContent(filePath: string): string {
    return this.contents.get(OriginalContentProvider.toUri(filePath).toString()) ?? "";
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }
}

export async function readCurrentFile(uri: vscode.Uri): Promise<string> {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (doc) {
    return doc.getText();
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Opens a native VS Code diff (original ↔ current) for a changed file.
 */
export async function openFileDiff(
  provider: OriginalContentProvider,
  file: DiffFile,
  root: string,
): Promise<void> {
  const filePath = path.resolve(root, file.path);
  const currentUri = vscode.Uri.file(filePath);

  let currentContent = "";
  try {
    currentContent = await readCurrentFile(currentUri);
  } catch {
    currentContent = "";
  }

  let originalContent: string;
  if (file.status === "deleted") {
    originalContent = reverseApplyPatch("", file.patch) || currentContent;
  } else if (file.status === "added") {
    originalContent = "";
  } else {
    originalContent = reverseApplyPatch(currentContent, file.patch);
  }

  provider.setContent(file.path, originalContent);

  const originalUri = OriginalContentProvider.toUri(file.path);
  const label = `${path.basename(file.path)} (before OpenCode) ↔ ${path.basename(file.path)}`;

  log(`Opening diff for ${file.path} (${file.status})`);
  await vscode.commands.executeCommand("vscode.diff", originalUri, currentUri, label);
}

/**
 * Fetches the session diff and opens native diff editors for every changed file.
 */
export async function openSessionDiff(
  provider: OriginalContentProvider,
  sdk: SdkClient,
  sessionID: string,
): Promise<void> {
  const files = await sdk.getSessionDiff(sessionID);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (files.length === 0) {
    vscode.window.showInformationMessage("OpenCode: no changes to show for this session.");
    return;
  }
  for (const file of files) {
    await openFileDiff(provider, file, root);
  }
}
