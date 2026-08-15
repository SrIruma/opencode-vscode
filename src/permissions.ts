import * as vscode from "vscode";
import type { SdkClient } from "./sdkClient";

/**
 * Handles opencode permission requests and surfaces them as VS Code
 * notifications. The server pauses the session until the user decides.
 */
export class PermissionHandler {
  private readonly pending = new Map<string, boolean>();

  constructor(private readonly sdk: SdkClient) {}

  async handle(event: unknown): Promise<void> {
    if (!event || typeof event !== "object") {
      return;
    }
    const { type, properties } = event as { type?: string; properties?: Record<string, unknown> };
    if (type !== "permission.updated") {
      return;
    }
    const permission = properties as {
      id: string;
      sessionID: string;
      title: string;
      type?: string;
      pattern?: string;
      metadata?: Record<string, unknown>;
    };

    if (!permission?.id || this.pending.get(permission.id)) {
      return;
    }
    this.pending.set(permission.id, true);

    const detail = [permission.pattern, permission.type].filter(Boolean).join(" — ");
    const message = `OpenCode needs permission: ${permission.title}`;
    const selected = await vscode.window.showWarningMessage(
      message,
      { modal: false, detail },
      { title: "Allow", isCloseAffordance: false },
      { title: "Always allow", isCloseAffordance: false },
      { title: "Deny", isCloseAffordance: true },
    );

    let response: "once" | "always" | "reject" = "reject";
    if (selected?.title === "Allow") {
      response = "once";
    } else if (selected?.title === "Always allow") {
      response = "always";
    }

    await this.sdk.respondPermission(permission.sessionID, permission.id, response);
    this.pending.delete(permission.id);
  }
}
