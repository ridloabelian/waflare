import type { WaflareStore } from "../state/store.ts";
import type {
  AutomationMode,
  AutomationRule,
  ChatMessage,
  DealStage,
  InboundEnvelope,
  LeadContact
} from "../types.ts";

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "berhenti", "batal", "cancel", "keluar"]);

export interface ReplyWindowStatus {
  within24h: boolean;
  msRemaining: number;
  hoursRemaining: number;
  requiresHsmTemplate: boolean;
}

export interface AutomationEvaluationResult {
  matchedRuleId: string;
  ruleName: string;
  mode: AutomationMode;
  renderedReply: string;
  sideEffectsApplied: boolean;
}

export interface BroadcastPlanResult {
  templateName: string;
  totalTaggedCandidates: number;
  queuedCount: number;
  skippedOptedOut: number;
  recipients: Array<{ contactId: string; phone: string; name: string; estimatedDelayMs: number }>;
}

/**
 * Unifies WhaLeads + Replyloom CRM features:
 * - 24h Meta Customer Service Window guard
 * - CTWA ad referral attribution
 * - STOP / Opt-out compliance
 * - Pipeline stages, tags, owner assignment, notes
 * - Automation rules with live / dry_run / shadow modes
 * - Paced broadcast planner
 */
export class CrmInboxEngine {
  store: WaflareStore;

  constructor(store: WaflareStore) {
    this.store = store;
  }

  getReplyWindowStatus(contact: LeadContact, now: number = Date.now()): ReplyWindowStatus {
    const elapsed = Math.max(0, now - contact.lastInboundAt);
    const msRemaining = Math.max(0, TWENTY_FOUR_HOURS_MS - elapsed);
    const within24h = contact.lastInboundAt > 0 && elapsed <= TWENTY_FOUR_HOURS_MS;
    return {
      within24h,
      msRemaining,
      hoursRemaining: Number((msRemaining / 3600_000).toFixed(2)),
      requiresHsmTemplate: !within24h
    };
  }

  canSendFreeformMessage(
    contact: LeadContact,
    now: number = Date.now()
  ): { allowed: boolean; reason?: string; window: ReplyWindowStatus } {
    const window = this.getReplyWindowStatus(contact, now);
    if (contact.optedOut) {
      return {
        allowed: false,
        reason: "Recipient has opted out (STOP compliance enforced).",
        window
      };
    }
    if (!window.within24h) {
      return {
        allowed: false,
        reason: "24h Meta customer service window expired; send an approved HSM template instead.",
        window
      };
    }
    return { allowed: true, window };
  }

  upsertContactFromInbound(envelope: InboundEnvelope): {
    contact: LeadContact;
    optedOutTriggered: boolean;
    automationsTriggered: AutomationEvaluationResult[];
  } {
    const id = `lead_${envelope.senderId}`;
    const existing = this.store.contacts.get(id);
    const now = envelope.timestamp || Date.now();

    const contact: LeadContact = existing ?? {
      id,
      phone: envelope.senderId,
      name: envelope.senderName || envelope.senderId,
      tenantId: envelope.tenantId,
      stage: "new",
      leadScore: 20,
      tags: [],
      notes: [],
      optedOut: false,
      lastInboundAt: now,
      lastOutboundAt: 0,
      createdAt: now,
      updatedAt: now
    };

    contact.name = envelope.senderName || contact.name;
    contact.lastInboundAt = now;
    contact.updatedAt = now;

    if (envelope.referral) {
      contact.ctwaReferral = envelope.referral;
      if (!contact.tags.includes("ctwa-ad")) {
        contact.tags.push("ctwa-ad");
      }
    }

    const normalized = envelope.text.trim().toLowerCase();
    let optedOutTriggered = false;
    if (OPT_OUT_KEYWORDS.has(normalized)) {
      contact.optedOut = true;
      contact.optedOutReason = `Keyword '${envelope.text.trim()}' at ${new Date(now).toISOString()}`;
      if (!contact.tags.includes("opted-out")) {
        contact.tags.push("opted-out");
      }
      optedOutTriggered = true;
    }

    this.store.contacts.set(contact.id, contact);

    const inboundRecord: ChatMessage = {
      id: envelope.messageId,
      contactId: contact.id,
      channel: envelope.channel,
      direction: "inbound",
      kind: envelope.kind === "image" ? "text" : envelope.kind,
      body: envelope.text,
      timestamp: now,
      metadata: envelope.referral ? { ctwaReferral: envelope.referral } : undefined
    };
    this.store.messages.push(inboundRecord);

    const automationsTriggered = optedOutTriggered
      ? []
      : this.evaluateAutomations(contact, envelope.text);

    return { contact, optedOutTriggered, automationsTriggered };
  }

  recordOutboundMessage(
    contactId: string,
    text: string,
    options?: {
      channel?: ChatMessage["channel"];
      kind?: ChatMessage["kind"];
      encryptedPayload?: string;
      timestamp?: number;
    }
  ): ChatMessage {
    const now = options?.timestamp ?? Date.now();
    const contact = this.store.contacts.get(contactId);
    if (contact) {
      contact.lastOutboundAt = now;
      contact.updatedAt = now;
    }
    const msg: ChatMessage = {
      id: `out_${crypto.randomUUID().slice(0, 12)}`,
      contactId,
      channel: options?.channel ?? "whatsapp",
      direction: "outbound",
      kind: options?.kind ?? "text",
      body: text,
      encryptedPayload: options?.encryptedPayload,
      timestamp: now
    };
    this.store.messages.push(msg);
    return msg;
  }

  evaluateAutomations(contact: LeadContact, text: string): AutomationEvaluationResult[] {
    const results: AutomationEvaluationResult[] = [];
    for (const rule of this.store.automationRules) {
      if (!rule.active) continue;
      const re = new RegExp(rule.keywordPattern, "i");
      if (!re.test(text)) continue;

      const rendered = rule.replyTemplate.replaceAll("{{name}}", contact.name);
      const isLive = rule.mode === "live";

      if (isLive) {
        if (rule.addTag && !contact.tags.includes(rule.addTag)) {
          contact.tags.push(rule.addTag);
        }
        if (rule.moveToStage) {
          contact.stage = rule.moveToStage;
        }
      } else {
        contact.notes.push(`[${rule.mode.toUpperCase()} rule:${rule.id}] would reply: ${rendered}`);
      }

      results.push({
        matchedRuleId: rule.id,
        ruleName: rule.name,
        mode: rule.mode,
        renderedReply: rendered,
        sideEffectsApplied: isLive
      });
    }
    return results;
  }

  upsertAutomationRule(rule: AutomationRule): AutomationRule {
    const idx = this.store.automationRules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) {
      this.store.automationRules[idx] = rule;
    } else {
      this.store.automationRules.push(rule);
    }
    return rule;
  }

  moveStage(contactId: string, stage: DealStage, owner?: string, note?: string): LeadContact | null {
    const contact = this.store.contacts.get(contactId);
    if (!contact) return null;
    contact.stage = stage;
    if (owner) contact.assignedOwner = owner;
    if (note) contact.notes.push(note);
    contact.updatedAt = Date.now();
    return contact;
  }

  listLeads(filter?: { stage?: DealStage; tag?: string }, now: number = Date.now()): Array<LeadContact & { window: ReplyWindowStatus }> {
    const items = Array.from(this.store.contacts.values())
      .filter((c) => (!filter?.stage || c.stage === filter.stage) && (!filter?.tag || c.tags.includes(filter.tag)))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return items.map((c) => ({
      ...c,
      window: this.getReplyWindowStatus(c, now)
    }));
  }

  searchMessages(query: string, contactId?: string, limit = 25): ChatMessage[] {
    const q = query.trim().toLowerCase();
    return this.store.messages
      .filter((m) => (!contactId || m.contactId === contactId) && (!q || m.body.toLowerCase().includes(q)))
      .slice(-limit)
      .reverse();
  }

  planPacedBroadcast(
    templateName: string,
    tagFilter?: string,
    pacingIntervalMs = 2500
  ): BroadcastPlanResult {
    const candidates = Array.from(this.store.contacts.values()).filter(
      (c) => !tagFilter || c.tags.includes(tagFilter)
    );
    let skippedOptedOut = 0;
    const recipients: BroadcastPlanResult["recipients"] = [];

    for (const c of candidates) {
      if (c.optedOut) {
        skippedOptedOut += 1;
        continue;
      }
      recipients.push({
        contactId: c.id,
        phone: c.phone,
        name: c.name,
        estimatedDelayMs: recipients.length * pacingIntervalMs
      });
    }

    return {
      templateName,
      totalTaggedCandidates: candidates.length,
      queuedCount: recipients.length,
      skippedOptedOut,
      recipients
    };
  }
}
