import * as vscode from "vscode";

export interface EditorContext {
  file?: string;
  selection?: string;
}

/**
 * Captures the active editor state: the current file and the selected text
 * (with line numbers), ready to be injected into a prompt.
 */
export function getActiveEditorContext(): EditorContext {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return {};
  }

  const file = editor.document.uri.fsPath;
  const selection = editor.selection;
  if (selection.isEmpty) {
    return { file };
  }

  const start = selection.start.line + 1;
  const end = selection.end.line + 1;
  const text = editor.document.getText(selection);
  return { file, selection: `${text}\n(${file}:${start}-${end})` };
}

/**
 * Builds a prompt prefix that tells the agent which file/selection is in
 * context. Returns an empty string when there is nothing to reference.
 */
export function buildContextPrompt(): string {
  const ctx = getActiveEditorContext();
  if (!ctx.file) {
    return "";
  }
  const parts: string[] = [];
  if (ctx.selection) {
    parts.push(`The user has selected the following text (from ${ctx.file}):\n<selection>\n${ctx.selection}\n</selection>`);
  } else {
    parts.push(`The user is currently viewing the file: ${ctx.file}`);
  }
  return parts.join("\n\n");
}
