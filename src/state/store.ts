import type {
  AiTrafficEvent,
  AutomationRule,
  CatalogItem,
  ChatMessage,
  CompanionDevice,
  FitnessEntry,
  HsmTemplate,
  LeadContact,
  PendingCloudflareOp,
  UsageRecord,
  UserMemoryState,
  WebhookTarget
} from "../types.ts";

export interface FactCorpusEntry {
  id: string;
  keywords: string[];
  claimSummary: string;
  verdict: "true" | "mostly_true" | "mixed" | "false";
  confidence: "high" | "medium";
  explanation: string;
  sources: Array<{ title: string; url: string }>;
}

export class WaflareStore {
  contacts: Map<string, LeadContact>;
  messages: ChatMessage[];
  templates: Map<string, HsmTemplate>;
  automationRules: AutomationRule[];
  webhookTargets: Map<string, WebhookTarget>;
  catalog: CatalogItem[];
  fitnessLogs: FitnessEntry[];
  pendingOps: Map<string, PendingCloudflareOp>;
  usageRecords: UsageRecord[];
  aiTrafficEvents: AiTrafficEvent[];
  companions: Map<string, CompanionDevice>;
  memories: Map<string, UserMemoryState>;
  factCorpus: FactCorpusEntry[];
  processedMessageIds: Set<string>;
  glassesQueue: Array<{ id: string; summary: string; timestamp: number }>;

  constructor(now: number = Date.now()) {
    this.contacts = new Map();
    this.messages = [];
    this.templates = new Map();
    this.automationRules = [];
    this.webhookTargets = new Map();
    this.catalog = [];
    this.fitnessLogs = [];
    this.pendingOps = new Map();
    this.usageRecords = [];
    this.aiTrafficEvents = [];
    this.companions = new Map();
    this.memories = new Map();
    this.factCorpus = [];
    this.processedMessageIds = new Set();
    this.glassesQueue = [];
    this.seed(now);
  }

  private seed(now: number): void {
    const c1: LeadContact = {
      id: "lead_6281234567890",
      phone: "6281234567890",
      name: "Aulia Rahman",
      tenantId: "default",
      stage: "qualified",
      leadScore: 78,
      assignedOwner: "ridlo",
      tags: ["enterprise", "ctwa-meta-ads", "hot-lead"],
      notes: ["Asked about Cloudflare Workers Free Plan limits & D1 CRM."],
      optedOut: false,
      lastInboundAt: now - 2 * 3600_000,
      lastOutboundAt: now - 3600_000,
      ctwaReferral: {
        sourceId: "ad_2026_cf_wa_01",
        sourceType: "ad",
        headline: "Deploy Your Own WhatsApp CRM on Cloudflare",
        body: "Zero monthly SaaS fees — pay only Cloudflare edge compute.",
        sourceUrl: "https://fb.me/waflare-demo"
      },
      createdAt: now - 48 * 3600_000,
      updatedAt: now - 3600_000
    };

    const c2: LeadContact = {
      id: "lead_6289876543210",
      phone: "6289876543210",
      name: "Budi Santoso",
      tenantId: "default",
      stage: "proposal",
      leadScore: 64,
      assignedOwner: "sales-team",
      tags: ["expired-window", "retail"],
      notes: ["Requires HSM template to re-open 24h Meta customer service window."],
      optedOut: false,
      lastInboundAt: now - 30 * 3600_000,
      lastOutboundAt: now - 26 * 3600_000,
      createdAt: now - 72 * 3600_000,
      updatedAt: now - 26 * 3600_000
    };

    this.contacts.set(c1.id, c1);
    this.contacts.set(c2.id, c2);

    this.messages.push(
      {
        id: "wamid.seed.1",
        contactId: c1.id,
        channel: "whatsapp",
        direction: "inbound",
        kind: "text",
        body: "Halo, kami butuh WhatsApp CRM + MCP server yang jalan di Cloudflare Workers untuk 3 admin. Harganya berapa?",
        timestamp: now - 2 * 3600_000
      },
      {
        id: "wamid.seed.2",
        contactId: c1.id,
        channel: "whatsapp",
        direction: "outbound",
        kind: "text",
        body: "Halo Aulia! Waflare berjalan penuh di akun Cloudflare Anda sendiri (Workers + D1 + Durable Objects), mulai dari $0/bulan di Free Plan atau $5/bulan untuk Durable Objects SQLite.",
        timestamp: now - 3600_000
      },
      {
        id: "wamid.seed.3",
        contactId: c2.id,
        channel: "whatsapp",
        direction: "inbound",
        kind: "text",
        body: "Boleh kirim proposal paket gateway multi-tenant?",
        timestamp: now - 30 * 3600_000
      }
    );

    const templates: HsmTemplate[] = [
      {
        name: "reopen_support_window",
        language: "en_US",
        category: "UTILITY",
        status: "APPROVED",
        body: "Hi {{1}}, we have an update regarding your {{2}} request. Reply here to resume the conversation.",
        updatedAt: now
      },
      {
        name: "order_confirmation_id",
        language: "id",
        category: "UTILITY",
        status: "APPROVED",
        body: "Halo {{1}}, pesanan #{{2}} telah dikonfirmasi dan sedang diproses.",
        updatedAt: now
      },
      {
        name: "otp_verification",
        language: "en_US",
        category: "AUTHENTICATION",
        status: "APPROVED",
        body: "Your Waflare verification code is {{1}}. Valid for 5 minutes.",
        updatedAt: now
      }
    ];
    for (const t of templates) {
      this.templates.set(t.name, t);
    }

    this.automationRules.push(
      {
        id: "rule_pricing_auto",
        name: "Auto-tag pricing inquiries",
        keywordPattern: "harga|price|pricing|paket|biaya",
        replyTemplate: "Terima kasih {{name}}! Paket self-hosted Cloudflare Workers mulai dari $0 (Free tier) hingga $5/bln (Paid DO).",
        addTag: "pricing-asked",
        moveToStage: "qualified",
        mode: "live",
        active: true
      },
      {
        id: "rule_promo_shadow",
        name: "Shadow enterprise upsell test",
        keywordPattern: "enterprise|custom|sla|multi-tenant",
        replyTemplate: "Kami siap bantu setup multi-tenant gateway & MCP server untuk tim Anda.",
        addTag: "enterprise-interest",
        mode: "shadow",
        active: true
      }
    );

    this.catalog.push(
      {
        id: "prod_01",
        sku: "WF-EDGE-CRM",
        title: "Waflare Self-Hosted CRM Edition",
        category: "software",
        priceUsd: 0,
        stock: 999,
        rating: 4.9,
        summary: "Shared team WhatsApp inbox, 24h reply window guard, CTWA attribution, and STOP compliance on Cloudflare D1.",
        tags: ["crm", "inbox", "cloudflare", "d1", "free"]
      },
      {
        id: "prod_02",
        sku: "WF-MCP-PRO",
        title: "Waflare Dual-Mode MCP Suite",
        category: "ai-tooling",
        priceUsd: 5,
        stock: 999,
        rating: 4.95,
        summary: "28-tool MCP server over Streamable HTTP with AES-256-GCM encrypted vault and toggleable read-only safety lock.",
        tags: ["mcp", "claude", "encryption", "durable-objects"]
      },
      {
        id: "prod_03",
        sku: "BK-CF-WORKERS",
        title: "Building Serverless Agents on Cloudflare Workers",
        category: "book",
        priceUsd: 29,
        stock: 42,
        rating: 4.8,
        summary: "Practical engineering handbook covering Durable Objects, D1 SQL, Vectorize RAG, and Workers AI.",
        tags: ["book", "cloudflare-workers", "rag", "sql", "ai"]
      },
      {
        id: "prod_04",
        sku: "BK-WA-API",
        title: "Mastering Meta WhatsApp Cloud API & Webhooks",
        category: "book",
        priceUsd: 24,
        stock: 30,
        rating: 4.7,
        summary: "Deep dive into HMAC-SHA256 signature verification, HSM templates, Flows, and 24-hour customer service windows.",
        tags: ["book", "whatsapp", "webhooks", "security"]
      },
      {
        id: "prod_05",
        sku: "WF-VOICE-KIT",
        title: "Multimodal Voice & Smart-Glasses Bridge Kit",
        category: "voice",
        priceUsd: 19,
        stock: 120,
        rating: 4.85,
        summary: "Workers AI Whisper STT, Twilio Opus 48kHz TTS, and glanceable WebKit HUD for Meta Ray-Ban Display.",
        tags: ["voice", "whisper", "twilio", "glasses", "elevenlabs"]
      }
    );

    this.factCorpus.push(
      {
        id: "fact_wa_24h",
        keywords: ["24", "hour", "jam", "window", "template", "hsm", "meta", "whatsapp"],
        claimSummary: "Meta WhatsApp Cloud API requires an approved HSM template when replying more than 24 hours after the user's last inbound message.",
        verdict: "true",
        confidence: "high",
        explanation: "Meta's Customer Service Window lasts 24 hours from the latest customer-initiated message; business-initiated messages outside that window must use pre-approved template messages.",
        sources: [
          {
            title: "Meta WhatsApp Business Platform — Messaging Windows",
            url: "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages"
          }
        ]
      },
      {
        id: "fact_cf_plexi",
        keywords: ["cloudflare", "plexi", "whatsapp", "key", "transparency", "e2ee"],
        claimSummary: "Cloudflare operates a Key Transparency auditor (Plexi) that verifies WhatsApp E2EE key directory logs.",
        verdict: "true",
        confidence: "high",
        explanation: "Cloudflare's open-source Plexi auditor exposes the whatsapp.key-transparency.v1 namespace at plexi.key-transparency.cloudflare.com to verify signed directory epochs.",
        sources: [
          {
            title: "cloudflare/plexi on GitHub",
            url: "https://github.com/cloudflare/plexi"
          },
          {
            title: "Cloudflare Plexi Live Namespaces",
            url: "https://plexi.key-transparency.cloudflare.com/namespaces"
          }
        ]
      },
      {
        id: "fact_free_do",
        keywords: ["durable", "objects", "free", "plan", "gratis", "sqlite"],
        claimSummary: "Cloudflare Durable Objects with SQLite storage work on the Workers Free plan with zero limits.",
        verdict: "mostly_true",
        confidence: "medium",
        explanation: "Cloudflare added Workers Free plan support for SQLite-backed Durable Objects (with daily request/storage free allowances), though high-throughput production containers/sandboxes still require the $5/mo Workers Paid plan.",
        sources: [
          {
            title: "Cloudflare Durable Objects Pricing",
            url: "https://developers.cloudflare.com/durable-objects/platform/pricing/"
          }
        ]
      }
    );

    this.fitnessLogs.push({
      id: "fit_seed_1",
      userId: c1.phone,
      entryType: "run",
      summary: "Morning 5km easy pace run",
      distanceKm: 5,
      durationMin: 31,
      calories: 320,
      loggedAt: now - 12 * 3600_000
    });

    this.glassesQueue.push({
      id: "hud_seed_1",
      summary: "WAFLARE READY · 2 leads · 0 pending CF ops · Plexi audited",
      timestamp: now
    });
  }
}
