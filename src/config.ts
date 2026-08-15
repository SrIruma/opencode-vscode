import * as vscode from "vscode";

export function getConfig(): {
  port: number;
  autoStart: boolean;
  binaryPath: string;
  startArgs: string[];
  autoRevealPanel: boolean;
} {
  const cfg = vscode.workspace.getConfiguration("opencode");
  return {
    port: cfg.get<number>("server.port", 4096),
    autoStart: cfg.get<boolean>("server.autoStart", true),
    binaryPath: cfg.get<string>("server.binaryPath", "opencode"),
    startArgs: cfg.get<string[]>("server.startArgs", []),
    autoRevealPanel: cfg.get<boolean>("chat.autoRevealPanel", true),
  };
}
