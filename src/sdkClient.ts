import { createOpencodeClient, type AssistantMessage, type Part, type Session } from "@opencode-ai/sdk";
import { log } from "./logger";

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface ModelInfo extends ModelRef {
  name: string;
}

export type SessionChatPayload = { providerID: string; modelID: string; parts: Array<{ type: "text"; text: string }> };

/**
 * Thin typed wrapper over the opencode SDK plus the handful of endpoints the
 * generated client does not expose yet (session diff).
 */
export class SdkClient {
  constructor(
    readonly client: OpencodeClient,
    private readonly baseUrl: string,
  ) {}

  async defaultModel(): Promise<ModelRef | undefined> {
    const { data, error } = await this.client.config.providers();
    if (error || !data) {
      log("Failed to resolve providers:", error);
      return undefined;
    }
    const defaults = data.default ?? {};
    const providerID = Object.keys(defaults)[0];
    const modelID = providerID ? defaults[providerID] : undefined;
    if (!providerID || !modelID) {
      return undefined;
    }
    return { providerID, modelID };
  }

  /** All models available across the configured providers. */
  async listModels(): Promise<ModelInfo[]> {
    const { data, error } = await this.client.config.providers();
    if (error || !data) {
      log("Failed to resolve providers:", error);
      return [];
    }
    const models: ModelInfo[] = [];
    for (const provider of data.providers ?? []) {
      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        models.push({
          providerID: provider.id,
          modelID,
          name: model.name || modelID,
        });
      }
    }
    return models.sort((a, b) => {
      const pa = a.providerID.localeCompare(b.providerID);
      return pa !== 0 ? pa : a.name.localeCompare(b.name);
    });
  }

  async deleteSession(sessionID: string): Promise<boolean> {
    const { data, error } = await this.client.session.delete({ path: { id: sessionID } });
    if (error) {
      log(`Failed to delete session ${sessionID}:`, error);
      return false;
    }
    return Boolean(data);
  }

  async listSessions(): Promise<Session[]> {
    const { data, error } = await this.client.session.list();
    if (error) {
      log("Failed to list sessions:", error);
      return [];
    }
    return (data as Session[]).sort((a, b) => b.time.updated - a.time.updated);
  }

  async createSession(): Promise<Session | undefined> {
    const { data, error } = await this.client.session.create({});
    if (error) {
      log("Failed to create session:", error);
      return undefined;
    }
    return data as Session;
  }

  async getMessages(sessionID: string): Promise<Array<{ info: { role: string; id: string }; parts: Part[] }>> {
    const { data, error } = await this.client.session.messages({ path: { id: sessionID } });
    if (error) {
      log(`Failed to get messages for ${sessionID}:`, error);
      return [];
    }
    return (data ?? []) as unknown as Array<{ info: { role: string; id: string }; parts: Part[] }>;
  }

  async chat(sessionID: string, payload: SessionChatPayload): Promise<AssistantMessage | undefined> {
    const { data, error } = await this.client.session.chat({
      path: { id: sessionID },
      body: payload,
    });
    if (error) {
      log(`Failed to send message to ${sessionID}:`, error);
      return undefined;
    }
    return data as AssistantMessage;
  }

  async abort(sessionID: string): Promise<boolean> {
    const { data, error } = await this.client.session.abort({ path: { id: sessionID } });
    if (error) {
      log(`Failed to abort ${sessionID}:`, error);
      return false;
    }
    return Boolean(data);
  }

  async revert(sessionID: string, messageID: string): Promise<boolean> {
    const { data, error } = await this.client.session.revert({
      path: { id: sessionID },
      body: { messageID },
    });
    if (error) {
      log(`Failed to revert ${messageID}:`, error);
      return false;
    }
    return Boolean(data);
  }

  async respondPermission(sessionID: string, permissionID: string, response: "once" | "always" | "reject"): Promise<boolean> {
    const { data, error } = await this.client.postSessionByIdPermissionsByPermissionId({
      path: { id: sessionID, permissionID },
      body: { response },
    });
    if (error) {
      log(`Failed to respond to permission ${permissionID}:`, error);
      return false;
    }
    return Boolean(data);
  }

  /**
   * Fetches the unified diff produced by a session. Endpoint not (yet) in the
   * generated SDK, so it uses fetch directly.
   */
  async getSessionDiff(sessionID: string, messageID?: string): Promise<DiffFile[]> {
    const url = `${this.baseUrl}/session/${sessionID}/diff${messageID ? `?messageID=${messageID}` : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return [];
      }
      return (await res.json()) as DiffFile[];
    } catch (err) {
      log(`Failed to fetch diff for ${sessionID}:`, (err as Error).message);
      return [];
    }
  }
}
