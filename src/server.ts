import { spawn, type ChildProcess } from "child_process";
import * as vscode from "vscode";
import { createOpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient } from "./sdkClient";
import { getConfig } from "./config";
import { log } from "./logger";

export type ServerStatus = "connecting" | "connected" | "disconnected" | "error";

export interface ServerEventMessage {
  type: "status";
  status: ServerStatus;
  error?: string;
}

const EVENT_RECONNECT_DELAY_MS = 3000;
const HEALTH_TIMEOUT_MS = 2500;
const SPAWN_TIMEOUT_MS = 20000;

const isWindows = process.platform === "win32";

/** Resolves the opencode binary name for the current platform. */
function resolveBinary(binaryPath: string): string {
  if (!isWindows) {
    return binaryPath;
  }
  return /\.(exe|cmd|bat)$/i.test(binaryPath) ? binaryPath : `${binaryPath}.exe`;
}

/**
 * Manages the lifecycle of the opencode server.
 *
 * If an `opencode serve` is already running on the configured port we connect
 * to it; otherwise we spawn one in the workspace folder. It also owns the
 * server-sent events stream used by the chat panel.
 */
export class ServerManager {
  private readonly _onStatus = new vscode.EventEmitter<ServerStatus>();
  readonly onStatus: vscode.Event<ServerStatus> = this._onStatus.event;

  private readonly _onEvent = new vscode.EventEmitter<unknown>();
  readonly onEvent: vscode.Event<unknown> = this._onEvent.event;

  private process: ChildProcess | undefined;
  private spawnedByUs = false;
  private client: OpencodeClient | undefined;
  private baseUrl: string;
  private status: ServerStatus = "disconnected";
  private sseAbort: AbortController | undefined;
  private stopped = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const { port } = getConfig();
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  get url(): string {
    return this.baseUrl;
  }

  get currentStatus(): ServerStatus {
    return this.status;
  }

  /**
   * Returns a client for the opencode server, creating it lazily.
   */
  getClient(): OpencodeClient {
    if (!this.client) {
      this.client = createOpencodeClient({ baseUrl: this.baseUrl });
    }
    return this.client;
  }

  async isHealthy(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/global/health`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ensures a reachable server. Connects to an existing one or spawns it.
   */
  async ensureRunning(): Promise<boolean> {
    if (this.status === "connected" && (await this.isHealthy())) {
      return true;
    }

    this.setStatus("connecting");

    if (await this.isHealthy()) {
      log("Connected to existing opencode server at", this.baseUrl);
      this.setStatus("connected");
      this.startEventStream();
      return true;
    }

    if (!this.process && !this.spawnedByUs) {
      const spawned = await this.spawnServer();
      if (!spawned) {
        this.setStatus("error");
        return false;
      }
    }

    const healthy = await this.waitForHealth(SPAWN_TIMEOUT_MS);
    if (healthy) {
      this.setStatus("connected");
      this.startEventStream();
    } else {
      this.setStatus("error");
    }
    return healthy;
  }

  private async spawnServer(): Promise<boolean> {
    const cfg = getConfig();
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      log("No workspace folder; cannot spawn opencode server.");
      return false;
    }

    const args = ["serve", "--port", String(cfg.port), "--hostname", "127.0.0.1", ...cfg.startArgs];
    const binary = resolveBinary(cfg.binaryPath);

    log(`Spawning "${binary} ${args.join(" ")}" in ${root}`);
    const proc = spawn(binary, args, {
      cwd: root,
      env: { ...process.env },
      windowsHide: true,
    });

    proc.stdout?.on("data", (d) => log(`[server] ${String(d).trimEnd()}`));
    proc.stderr?.on("data", (d) => log(`[server] ${String(d).trimEnd()}`));
    proc.on("error", (err) => {
      this.setStatus("error");
      log(`Failed to start opencode server: ${err.message}`);
    });
    proc.on("exit", (code, signal) => {
      log(`opencode server exited (code=${code} signal=${signal})`);
      if (!this.stopped) {
        this.process = undefined;
        this.setStatus("disconnected");
      }
    });

    this.process = proc;
    this.spawnedByUs = true;
    return true;
  }

  private async waitForHealth(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private setStatus(status: ServerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this._onStatus.fire(status);
  }

  /**
   * Subscribes to the server-sent events stream. Reconnects automatically.
   */
  startEventStream(): void {
    if (this.sseAbort) {
      return;
    }
    const abort = new AbortController();
    this.sseAbort = abort;

    const connect = async () => {
      while (!abort.signal.aborted) {
        try {
          const res = await fetch(`${this.baseUrl}/event`, { signal: abort.signal });
          if (!res.ok || !res.body) {
            throw new Error(`event stream returned ${res.status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data:")) {
                try {
                  const payload = JSON.parse(trimmed.slice(5).trim());
                  this._onEvent.fire(payload);
                } catch {
                  // skip malformed frames
                }
              }
            }
          }
        } catch (err) {
          if (abort.signal.aborted) {
            return;
          }
          log(`Event stream disconnected (${(err as Error).message}); retrying in ${EVENT_RECONNECT_DELAY_MS}ms`);
          await new Promise((r) => setTimeout(r, EVENT_RECONNECT_DELAY_MS));
        }
      }
    };

    connect();
  }

  stopEventStream(): void {
    this.sseAbort?.abort();
    this.sseAbort = undefined;
  }

  /**
   * Stops the server only if we spawned it. The user may keep a server they
   * started themselves (e.g. the TUI) running.
   */
  async dispose(): Promise<void> {
    this.stopped = true;
    this.stopEventStream();
    if (this.process && this.spawnedByUs) {
      log("Stopping opencode server started by the extension.");
      this.process.kill();
    }
  }
}
