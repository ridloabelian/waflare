export interface DurableObjectStateLike {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
}

export interface SessionSnapshot {
  accountId: string;
  paired: boolean;
  qrPairingToken: string | null;
  lastActivityAt: number;
  messageCount: number;
}

/**
 * Per-account isolated Cloudflare Durable Object (coldfrey/whatsapp-cloudflare-agent & felipeadeildo/whatsapp-mcp).
 * Also works standalone in local Node tests via in-memory storage fallback.
 */
export class ConversationSessionDO {
  state: DurableObjectStateLike | null;
  memoryCache: Map<string, unknown>;

  constructor(state: DurableObjectStateLike | null = null) {
    this.state = state;
    this.memoryCache = new Map();
  }

  private async getStored<T>(key: string): Promise<T | undefined> {
    if (this.state) {
      return this.state.storage.get<T>(key);
    }
    return this.memoryCache.get(key) as T | undefined;
  }

  private async putStored(key: string, value: unknown): Promise<void> {
    if (this.state) {
      await this.state.storage.put(key, value);
    } else {
      this.memoryCache.set(key, value);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const snapshot = (await this.getStored<SessionSnapshot>("snapshot")) ?? {
      accountId: url.searchParams.get("account") ?? "personal",
      paired: false,
      qrPairingToken: null,
      lastActivityAt: Date.now(),
      messageCount: 0
    };

    if (request.method === "POST" && url.pathname.endsWith("/pair")) {
      snapshot.paired = true;
      snapshot.qrPairingToken = `qr_${crypto.randomUUID().slice(0, 10)}`;
      snapshot.lastActivityAt = Date.now();
      await this.putStored("snapshot", snapshot);
      return Response.json({ ok: true, snapshot });
    }

    if (request.method === "POST" && url.pathname.endsWith("/touch")) {
      snapshot.messageCount += 1;
      snapshot.lastActivityAt = Date.now();
      await this.putStored("snapshot", snapshot);
      return Response.json({ ok: true, snapshot });
    }

    return Response.json({ ok: true, snapshot });
  }
}
