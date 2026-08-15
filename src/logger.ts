import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("OpenCode");
  }
  return channel;
}

export function log(message: string, ...args: unknown[]): void {
  getOutputChannel().appendLine(
    `[${new Date().toISOString()}] ${message}${args.length ? " " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : ""}`,
  );
}
