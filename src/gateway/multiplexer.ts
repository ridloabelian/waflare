import type { WaflareStore } from "../state/store.ts";
import type { FetchLike, HsmTemplate, InboundEnvelope, WebhookTarget } from "../types.ts";
import { signMetaPayload } from "../channels/metaWebhook.ts";

export interface MultiplexDeliveryReport {
  deduplicated: boolean;
  targetsAttempted: number;
  results: Array<{ targetId: string; url: string; ok: boolean; statusCode: number }>;
}

/**
 * Watahub-style Webhook Multiplexer, idempotency deduplicator, HSM registry, and WhatsApp Flows router.
 */
export class WebhookMultiplexer {
  store: WaflareStore;
  maxDedupSize: number;

  constructor(store: WaflareStore, maxDedupSize = 2000) {
    this.store = store;
    this.maxDedupSize = maxDedupSize;
  }

  /**
   * Returns true if messageId has not been seen before (and records it), false if duplicate.
   */
  markIfUnique(messageId: string): boolean {
    if (this.store.processedMessageIds.has(messageId)) {
      return false;
    }
    if (this.store.processedMessageIds.size >= this.maxDedupSize) {
      const oldest = this.store.processedMessageIds.values().next().value;
      if (oldest !== undefined) {
        this.store.processedMessageIds.delete(oldest);
      }
    }
    this.store.processedMessageIds.add(messageId);
    return true;
  }

  registerTarget(input: { id?: string; url: string; secret?: string; events?: string[] }): WebhookTarget {
    const target: WebhookTarget = {
      id: input.id ?? `wh_${crypto.randomUUID().slice(0, 8)}`,
      url: input.url,
      secret: input.secret ?? "waflare-webhook-secret",
      events: input.events?.length ? input.events : ["*"],
      active: true,
      createdAt: Date.now()
    };
    this.store.webhookTargets.set(target.id, target);
    return target;
  }

  listTargets(): WebhookTarget[] {
    return Array.from(this.store.webhookTargets.values());
  }

  async fanOut(
    eventType: string,
    envelope: InboundEnvelope,
    fetchImpl: FetchLike = fetch
  ): Promise<MultiplexDeliveryReport> {
    if (!this.markIfUnique(envelope.messageId)) {
      return { deduplicated: true, targetsAttempted: 0, results: [] };
    }

    const targets = this.listTargets().filter(
      (t) => t.active && (t.events.includes("*") || t.events.includes(eventType))
    );
    const body = JSON.stringify({ event: eventType, envelope });
    const results: MultiplexDeliveryReport["results"] = [];

    for (const target of targets) {
      const signature = await signMetaPayload(body, target.secret);
      try {
        const resp = await fetchImpl(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Waflare-Signature-256": signature
          },
          body
        });
        results.push({ targetId: target.id, url: target.url, ok: resp.ok, statusCode: resp.status });
      } catch {
        results.push({ targetId: target.id, url: target.url, ok: false, statusCode: 0 });
      }
    }

    return {
      deduplicated: false,
      targetsAttempted: targets.length,
      results
    };
  }

  upsertTemplate(template: Omit<HsmTemplate, "updatedAt">): HsmTemplate {
    const record: HsmTemplate = {
      ...template,
      updatedAt: Date.now()
    };
    this.store.templates.set(record.name, record);
    return record;
  }

  listTemplates(): HsmTemplate[] {
    return Array.from(this.store.templates.values());
  }

  handleFlowSubmission(flowPayload: {
    flowId: string;
    senderId: string;
    screen?: string;
    data?: Record<string, unknown>;
  }): { accepted: boolean; nextScreen: string; confirmationText: string } {
    return {
      accepted: true,
      nextScreen: "SUCCESS",
      confirmationText: `WhatsApp Flow '${flowPayload.flowId}' completed for ${flowPayload.senderId} (screen=${flowPayload.screen ?? "FINAL"}).`
    };
  }
}
