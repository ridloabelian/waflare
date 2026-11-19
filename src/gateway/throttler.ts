export interface TenantSessionConfig {
  tenantId: string;
  transport: "meta_cloud" | "baileys_bridge" | "twilio";
  phoneNumber: string;
  maxTokens: number;
  refillPerSecond: number;
  paired: boolean;
  updatedAt: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  sentCount: number;
  blockedCount: number;
}

export interface ThrottleDecision {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
  typingDelayMs: number;
  reason?: string;
}

/**
 * Multi-tenant session isolation and Anti-Ban Token-Bucket Throttler
 * with human-like typing jitter estimation.
 */
export class AntiBanThrottler {
  buckets: Map<string, BucketState>;
  tenants: Map<string, TenantSessionConfig>;
  defaultCapacity: number;
  defaultRefillPerSec: number;

  constructor(defaultCapacity = 8, defaultRefillPerSec = 0.5) {
    this.buckets = new Map();
    this.tenants = new Map();
    this.defaultCapacity = defaultCapacity;
    this.defaultRefillPerSec = defaultRefillPerSec;
    this.registerTenant({
      tenantId: "default",
      transport: "meta_cloud",
      phoneNumber: "628111000222",
      maxTokens: defaultCapacity,
      refillPerSecond: defaultRefillPerSec,
      paired: true,
      updatedAt: Date.now()
    });
  }

  registerTenant(cfg: TenantSessionConfig): TenantSessionConfig {
    this.tenants.set(cfg.tenantId, cfg);
    return cfg;
  }

  estimateTypingDelayMs(text: string): number {
    const base = 350;
    const perChar = Math.min(text.length * 14, 1800);
    return base + perChar;
  }

  consume(
    tenantId: string,
    recipientKey: string,
    messageText: string,
    now: number = Date.now()
  ): ThrottleDecision {
    const tenant = this.tenants.get(tenantId);
    const capacity = tenant?.maxTokens ?? this.defaultCapacity;
    const refillRate = tenant?.refillPerSecond ?? this.defaultRefillPerSec;
    const bucketKey = `${tenantId}:${recipientKey}`;

    const existing = this.buckets.get(bucketKey) ?? {
      tokens: capacity,
      lastRefillMs: now,
      sentCount: 0,
      blockedCount: 0
    };

    const elapsedSec = Math.max(0, (now - existing.lastRefillMs) / 1000);
    const refilled = Math.min(capacity, existing.tokens + elapsedSec * refillRate);
    existing.lastRefillMs = now;

    if (refilled < 1) {
      existing.tokens = refilled;
      existing.blockedCount += 1;
      this.buckets.set(bucketKey, existing);
      const needed = 1 - refilled;
      const retryAfterMs = Math.ceil((needed / refillRate) * 1000);
      return {
        allowed: false,
        remainingTokens: Number(refilled.toFixed(2)),
        retryAfterMs,
        typingDelayMs: 0,
        reason: "Anti-ban rate limit reached for recipient bucket; cool-down required."
      };
    }

    existing.tokens = refilled - 1;
    existing.sentCount += 1;
    this.buckets.set(bucketKey, existing);
    return {
      allowed: true,
      remainingTokens: Number(existing.tokens.toFixed(2)),
      retryAfterMs: 0,
      typingDelayMs: this.estimateTypingDelayMs(messageText)
    };
  }

  getStats(tenantId?: string): Array<{ key: string } & BucketState> {
    const out: Array<{ key: string } & BucketState> = [];
    for (const [key, state] of this.buckets.entries()) {
      if (!tenantId || key.startsWith(`${tenantId}:`)) {
        out.push({ key, ...state });
      }
    }
    return out;
  }
}
