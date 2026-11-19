import type { CuratedProject } from "../types.ts";

export const CURATED_PROJECTS: readonly CuratedProject[] = [
  {
    rank: 1,
    fullName: "finereli/whatsapp-mcp",
    url: "https://github.com/finereli/whatsapp-mcp",
    stars: 421,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 2 — Dual-Mode MCP & Vault",
    waflareModule: "src/security/vault.ts + src/mcp/server.ts",
    summary: "Read-only encrypted MCP server letting AI agents safely search and read WhatsApp history on Cloudflare.",
    capabilitiesMerged: [
      "AES-256-GCM + PBKDF2 encrypted message vault",
      "Strict MCP_READ_ONLY toggle blocking outbound mutations"
    ]
  },
  {
    rank: 2,
    fullName: "santmun/forja",
    url: "https://github.com/santmun/forja",
    stars: 138,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 3 — CRM & Omnichannel Brain",
    waflareModule: "src/channels/omnichannel.ts",
    summary: "Self-hosted AI support chatbot for WhatsApp, Instagram, Messenger, and Telegram on Cloudflare Workers.",
    capabilitiesMerged: [
      "Unified WhatsApp/Instagram/Messenger/Telegram envelope normalizer",
      "KB-grounded 24/7 support replies & owner escalation"
    ]
  },
  {
    rank: 3,
    fullName: "felipeadeildo/whatsapp-mcp",
    url: "https://github.com/felipeadeildo/whatsapp-mcp",
    stars: 100,
    language: "TypeScript",
    license: "GPL-3.0 (clean-room reimplementation)",
    pillar: "Pillar 2 — Dual-Mode MCP & Vault",
    waflareModule: "src/durable/sessionDO.ts + src/mcp/server.ts",
    summary: "Read, search, and send WhatsApp MCP server on Cloudflare Workers + Durable Objects with one-click deploy.",
    capabilitiesMerged: [
      "Per-account Durable Object isolation",
      "Read+Search+Send MCP workflow & device pairing state"
    ]
  },
  {
    rank: 4,
    fullName: "WhaBuzz/whaleads",
    url: "https://github.com/WhaBuzz/whaleads",
    stars: 43,
    language: "TypeScript",
    license: "Apache-2.0",
    pillar: "Pillar 3 — CRM & Omnichannel Brain",
    waflareModule: "src/crm/inbox.ts",
    summary: "Free WhatsApp lead inbox, CRM, and automation builder on Cloudflare Workers Free tier (D1, DO, R2).",
    capabilitiesMerged: [
      "24-hour Meta reply window enforcement",
      "Click-to-WhatsApp (CTWA) ad attribution tracking",
      "No-code automation dry-run & shadow modes",
      "STOP / opt-out broadcast compliance"
    ]
  },
  {
    rank: 5,
    fullName: "cloudflare/plexi",
    url: "https://github.com/cloudflare/plexi",
    stars: 41,
    language: "Rust",
    license: "Apache-2.0",
    pillar: "Pillar 7 — Key Transparency E2EE Auditor",
    waflareModule: "src/security/plexiAuditor.ts",
    summary: "Official Cloudflare Key Transparency auditor verifying WhatsApp E2EE key directory logs.",
    capabilitiesMerged: [
      "Live audit of whatsapp.key-transparency.v1 namespace",
      "Epoch and 64-char SHA-256 root hash format verification"
    ]
  },
  {
    rank: 6,
    fullName: "fkrein1/whatsapp-fitness-agent",
    url: "https://github.com/fkrein1/whatsapp-fitness-agent",
    stars: 30,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/skills/fitnessLogger.ts",
    summary: "Natural WhatsApp fitness & nutrition logger storing workouts, runs, meals, and weight in D1.",
    capabilitiesMerged: [
      "Natural-language parser for runs, workouts, meals (kcal/protein), and weight",
      "Weekly fitness rollup & calorie analytics"
    ]
  },
  {
    rank: 7,
    fullName: "thorwebdev/twilio-whatsapp-voice-agent",
    url: "https://github.com/thorwebdev/twilio-whatsapp-voice-agent",
    stars: 30,
    language: "TypeScript",
    license: "Unspecified",
    pillar: "Pillar 5 — Multimodal Voice & Audio",
    waflareModule: "src/channels/twilioAdapter.ts + src/voice/audioPipeline.ts",
    summary: "Asynchronous voice agent for WhatsApp built with ElevenLabs, Twilio, and Hono on Cloudflare.",
    capabilitiesMerged: [
      "Twilio X-Twilio-Signature HMAC-SHA1 validator & form webhook parser",
      "Opus 48kHz voice-note synthesis descriptor & ElevenLabs hook"
    ]
  },
  {
    rank: 8,
    fullName: "marceloeatworld/clopinette-ai",
    url: "https://github.com/marceloeatworld/clopinette-ai",
    stars: 28,
    language: "TypeScript",
    license: "Unspecified",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/agents/memory.ts + src/agents/orchestrator.ts",
    summary: "Cloudflare-native AI agent with multi-layer memory, skills, and slash commands on Workers + DO.",
    capabilitiesMerged: [
      "3-layer memory (working history, episodic recall, user profile)",
      "Slash command router (/sql, /rag, /verify, /fitness, /ops, /audit-e2ee)"
    ]
  },
  {
    rank: 9,
    fullName: "ashokvarmamatta/ZeroClawAndroid",
    url: "https://github.com/ashokvarmamatta/ZeroClawAndroid",
    stars: 17,
    language: "Kotlin",
    license: "MIT",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/ai/providerRouter.ts + src/channels/companionBridge.ts",
    summary: "Always-on Android bridge linking WhatsApp & Telegram to multi-LLM failover via Cloudflare Tunnel.",
    capabilitiesMerged: [
      "Multi-provider LLM router with circuit-breaker failover",
      "Cloudflare Tunnel mobile/Android companion heartbeat & relay API"
    ]
  },
  {
    rank: 10,
    fullName: "thareekanvar/replyloom",
    url: "https://github.com/thareekanvar/replyloom",
    stars: 14,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 3 — CRM & Omnichannel Brain",
    waflareModule: "src/crm/inbox.ts",
    summary: "Open-source self-hosted WhatsApp CRM on Cloudflare with shared inbox, deal pipeline, and broadcasts.",
    capabilitiesMerged: [
      "Multi-number shared team inbox & agent assignment",
      "Contact tags, internal notes, deal stages, and paced broadcasts"
    ]
  },
  {
    rank: 11,
    fullName: "coldfrey/whatsapp-cloudflare-agent",
    url: "https://github.com/coldfrey/whatsapp-cloudflare-agent",
    stars: 14,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/durable/sessionDO.ts",
    summary: "Quick-start template for per-user isolated WhatsApp AI agents on Cloudflare Workers + Durable Objects.",
    capabilitiesMerged: [
      "Isolated per-user ConversationSessionDO state persistence",
      "Portable in-memory fallback for local development"
    ]
  },
  {
    rank: 12,
    fullName: "pain2hustle/AMH-Cloudflare-Ops-MCP-by-WT",
    url: "https://github.com/pain2hustle/AMH-Cloudflare-Ops-MCP-by-WT",
    stars: 10,
    language: "HTML",
    license: "Custom (clean-room reimplementation)",
    pillar: "Pillar 6 — ChatOps, Glasses HUD & AI Radar",
    waflareModule: "src/ops/approvalGate.ts",
    summary: "Approval-gated Cloudflare infrastructure operations controlled via WhatsApp and MCP.",
    capabilitiesMerged: [
      "Approval-gated DNS, Cache Purge, KV & Pages ops queue",
      "WhatsApp interactive Approve/Reject callback execution"
    ]
  },
  {
    rank: 13,
    fullName: "AlwaysHungrie/salts-agent",
    url: "https://github.com/AlwaysHungrie/salts-agent",
    stars: 9,
    language: "TypeScript",
    license: "Apache-2.0",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/ai/usageLedger.ts",
    summary: "Pay-per-use personal AI agents across WhatsApp, Telegram, and Web running serverless on Cloudflare.",
    capabilitiesMerged: [
      "Micro-USD token usage ledger ($0 idle cost)",
      "Per-user spend cap enforcement"
    ]
  },
  {
    rank: 14,
    fullName: "omqkhafi/sently",
    url: "https://github.com/omqkhafi/sently",
    stars: 9,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/channels/sentlySdk.ts",
    summary: "Zero-dependency TypeScript messaging SDK for Email, SMS, WhatsApp, and Push on Cloudflare Workers.",
    capabilitiesMerged: [
      "Single unified dispatcher across WhatsApp, Telegram, Email, SMS, ntfy, Discord, Webhook",
      "Interchangeable provider fallback chain & delivery logs"
    ]
  },
  {
    rank: 15,
    fullName: "stivenrosales/kapso-agente-yt",
    url: "https://github.com/stivenrosales/kapso-agente-yt",
    stars: 8,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/retrieval/dualRetrieval.ts",
    summary: "WhatsApp recommendation agent comparing structured Text-to-SQL (/sql) vs semantic RAG (/rag).",
    capabilitiesMerged: [
      "Guardrailed read-only SELECT Text-to-SQL evaluator",
      "Hybrid BM25 + cosine vector RAG retrieval & side-by-side benchmark"
    ]
  },
  {
    rank: 16,
    fullName: "depombo/whatsapp-api-cf-worker",
    url: "https://github.com/depombo/whatsapp-api-cf-worker",
    stars: 7,
    language: "TypeScript",
    license: "Unspecified",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/channels/metaWebhook.ts",
    summary: "Zero-dependency WhatsApp Cloud API Cloudflare Worker template using Web Crypto & fetch.",
    capabilitiesMerged: [
      "Meta GET /webhook verify challenge",
      "Constant-time Web Crypto X-Hub-Signature-256 HMAC-SHA256 verification"
    ]
  },
  {
    rank: 17,
    fullName: "jkpe/workers-whatsapp-transcription",
    url: "https://github.com/jkpe/workers-whatsapp-transcription",
    stars: 7,
    language: "JavaScript",
    license: "Unspecified",
    pillar: "Pillar 5 — Multimodal Voice & Audio",
    waflareModule: "src/voice/audioPipeline.ts",
    summary: "Cloudflare Worker transcribing WhatsApp voice messages with Workers AI Whisper & summarizing.",
    capabilitiesMerged: [
      "Workers AI @cf/openai/whisper-large-v3-turbo transcription adapter",
      "Automatic concise summary generation for voice notes"
    ]
  },
  {
    rank: 18,
    fullName: "Tienduyvo/meta-glass-display-webkit-harness",
    url: "https://github.com/Tienduyvo/meta-glass-display-webkit-harness",
    stars: 7,
    language: "HTML",
    license: "MIT",
    pillar: "Pillar 6 — ChatOps, Glasses HUD & AI Radar",
    waflareModule: "src/channels/glassesHud.ts",
    summary: "Voice-control coding sessions from Meta Ray-Ban Display glasses via WhatsApp + Cloudflare Worker.",
    capabilitiesMerged: [
      "Glanceable monochrome Smart-Glasses HUD (/glasses)",
      "Compact 3-line WhatsApp-to-Glasses bridge cards"
    ]
  },
  {
    rank: 19,
    fullName: "usepulso/pulso",
    url: "https://github.com/usepulso/pulso",
    stars: 6,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/agents/orchestrator.ts",
    summary: "Multi-agent orchestration platform across messaging channels with Cloudflare Workers & MCP.",
    capabilitiesMerged: [
      "Multi-agent intent classifier routing to specialized sub-agents",
      "Unified execution receipts across channels"
    ]
  },
  {
    rank: 20,
    fullName: "Hub-Ventures/watahub",
    url: "https://github.com/Hub-Ventures/watahub",
    stars: 5,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/gateway/multiplexer.ts",
    summary: "Open-source WhatsApp Cloud API Gateway with embedded signup, webhook multiplexing, and HSM sync.",
    capabilitiesMerged: [
      "Webhook Multiplexer fanning out signed events with idempotency dedup",
      "HSM template registry & WhatsApp Flows payload handler"
    ]
  },
  {
    rank: 21,
    fullName: "itsgoharrehman/whatsapp-ai-gateway",
    url: "https://github.com/itsgoharrehman/whatsapp-ai-gateway",
    stars: 5,
    language: "JavaScript",
    license: "MIT",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/gateway/throttler.ts",
    summary: "Multi-tenant WhatsApp AI gateway with isolated session management and anti-ban throttling.",
    capabilitiesMerged: [
      "Per-tenant session isolation (Meta Cloud + Baileys bridge)",
      "Anti-ban token-bucket rate limiter & human typing jitter"
    ]
  },
  {
    rank: 22,
    fullName: "vibegui/awesome-ai-native-cloudflare-app",
    url: "https://github.com/vibegui/awesome-ai-native-cloudflare-app",
    stars: 5,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 2 — Dual-Mode MCP & Vault",
    waflareModule: "src/index.ts + AGENTS.md",
    summary: "Single Cloudflare Worker acting simultaneously as HTTP API, MCP server, Admin UI, and WhatsApp bot.",
    capabilitiesMerged: [
      "Unified single-Worker multi-surface entrypoint",
      "Self-extending AGENTS.md field guide for coding agents"
    ]
  },
  {
    rank: 23,
    fullName: "surfacedby/ai-traffic-alerts-for-cloudflare",
    url: "https://github.com/surfacedby/ai-traffic-alerts-for-cloudflare",
    stars: 4,
    language: "JavaScript",
    license: "MIT",
    pillar: "Pillar 6 — ChatOps, Glasses HUD & AI Radar",
    waflareModule: "src/ops/aiTrafficMonitor.ts",
    summary: "Zero-database Cloudflare Worker sending instant WhatsApp/Telegram/ntfy alerts on AI referrals & crawlers.",
    capabilitiesMerged: [
      "AI referral detector (ChatGPT, Perplexity, Gemini, Claude, Copilot, Grok)",
      "AI crawler detector (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot) with ALERT_ON filter"
    ]
  },
  {
    rank: 24,
    fullName: "spirit122/whatsapp-mcp-server",
    url: "https://github.com/spirit122/whatsapp-mcp-server",
    stars: 3,
    language: "TypeScript",
    license: "MIT",
    pillar: "Pillar 2 — Dual-Mode MCP & Vault",
    waflareModule: "src/mcp/tools.ts",
    summary: "Full-featured MCP Server for WhatsApp Business Cloud API hosted on Cloudflare Workers.",
    capabilitiesMerged: [
      "28 structured MCP tools across 8 operational modules",
      "Interactive buttons/lists, templates, media, CRM, and Flows via MCP"
    ]
  },
  {
    rank: 25,
    fullName: "ukimsanov/sagent",
    url: "https://github.com/ukimsanov/sagent",
    stars: 3,
    language: "TypeScript",
    license: "Unspecified",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/skills/salesAgent.ts",
    summary: "AI WhatsApp sales agent with product discovery, lead scoring, and human handoff on Cloudflare.",
    capabilitiesMerged: [
      "Catalog product recommendation & pricing pitch",
      "0-100 BANT lead scorer & automatic human handoff trigger"
    ]
  },
  {
    rank: 26,
    fullName: "es-cierto/es-cierto",
    url: "https://github.com/es-cierto/es-cierto",
    stars: 3,
    language: "TypeScript",
    license: "AGPL-3.0 (clean-room reimplementation)",
    pillar: "Pillar 4 — Autonomous AI & Vertical Skills",
    waflareModule: "src/skills/factChecker.ts",
    summary: "Open-source fact-checking bot on Cloudflare Workers + Workers AI returning verdicts & citations.",
    capabilitiesMerged: [
      "Claim extraction & structured verdict scoring",
      "Citation-backed evidence verification via /verify"
    ]
  },
  {
    rank: 27,
    fullName: "the-dream-machine/chatbot-whatsapp-workers",
    url: "https://github.com/the-dream-machine/chatbot-whatsapp-workers",
    stars: 3,
    language: "TypeScript",
    license: "Unspecified",
    pillar: "Pillar 1 — Gateway, Multiplexer & SDK",
    waflareModule: "src/index.ts",
    summary: "Minimal WhatsApp OpenAI chatbot API template running natively on Cloudflare Workers.",
    capabilitiesMerged: [
      "OpenAI-compatible /v1/chat/completions endpoint",
      "Direct Worker webhook-to-completion responder"
    ]
  }
] as const;
