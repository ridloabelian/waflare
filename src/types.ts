export type ChannelKind =
  | "whatsapp"
  | "twilio_whatsapp"
  | "telegram"
  | "instagram"
  | "messenger"
  | "web"
  | "glasses";

export type SentlyChannel =
  | "whatsapp"
  | "telegram"
  | "email"
  | "sms"
  | "ntfy"
  | "discord"
  | "webhook";

export type DealStage = "new" | "qualified" | "proposal" | "won" | "lost";

export type AutomationMode = "live" | "dry_run" | "shadow";

export type AlertTrafficMode = "referrals" | "crawlers" | "both";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null>;
}

export interface WorkersAiLike {
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Env {
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_APP_SECRET?: string;
  WEBHOOK_VERIFY_TOKEN?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_NUMBER?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_API_KEY?: string;
  VAULT_PASSPHRASE?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_READ_ONLY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  OWNER_ALERT_CHANNEL?: string;
  OWNER_ALERT_TARGET?: string;
  ALERT_ON?: string;
  DEFAULT_TIMEZONE?: string;
  USER_BUDGET_MICRO_USD?: string;
  PLEXI_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  DISCORD_WEBHOOK_URL?: string;
  NTFY_TOPIC_URL?: string;
  RESEND_API_KEY?: string;
  DB?: D1DatabaseLike;
  WAFLARE_KV?: KvNamespaceLike;
  MEDIA_BUCKET?: R2BucketLike;
  AI?: WorkersAiLike;
  SESSION_DO?: DurableObjectNamespaceLike;
  fetchImpl?: FetchLike;
}

export interface CtwaReferral {
  sourceId: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  sourceUrl?: string;
  ctwaClid?: string;
}

export interface InboundEnvelope {
  messageId: string;
  tenantId: string;
  channel: ChannelKind;
  senderId: string;
  senderName: string;
  recipientNumber: string;
  kind: "text" | "audio" | "image" | "interactive" | "system";
  text: string;
  interactiveReplyId?: string;
  mediaUrl?: string;
  audioBase64?: string;
  referral?: CtwaReferral;
  timestamp: number;
  raw?: unknown;
}

export interface OutboundMessage {
  id: string;
  to: string;
  channel: SentlyChannel;
  kind: "text" | "template" | "interactive_buttons" | "interactive_list" | "cta_url" | "audio";
  text: string;
  templateName?: string;
  buttons?: Array<{ id: string; title: string }>;
  ctaUrl?: { label: string; url: string };
  audioMimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface LeadContact {
  id: string;
  phone: string;
  name: string;
  tenantId: string;
  stage: DealStage;
  leadScore: number;
  assignedOwner?: string;
  tags: string[];
  notes: string[];
  optedOut: boolean;
  optedOutReason?: string;
  lastInboundAt: number;
  lastOutboundAt: number;
  ctwaReferral?: CtwaReferral;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  contactId: string;
  channel: ChannelKind;
  direction: "inbound" | "outbound";
  kind: "text" | "audio" | "interactive" | "template" | "system";
  body: string;
  encryptedPayload?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface HsmTemplate {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING" | "REJECTED";
  body: string;
  updatedAt: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  keywordPattern: string;
  replyTemplate: string;
  addTag?: string;
  moveToStage?: DealStage;
  mode: AutomationMode;
  active: boolean;
}

export interface WebhookTarget {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: number;
}

export interface CatalogItem {
  id: string;
  sku: string;
  title: string;
  category: string;
  priceUsd: number;
  stock: number;
  rating: number;
  summary: string;
  tags: string[];
}

export interface FitnessEntry {
  id: string;
  userId: string;
  entryType: "run" | "workout" | "meal" | "weight";
  summary: string;
  distanceKm?: number;
  durationMin?: number;
  calories?: number;
  proteinGrams?: number;
  weightKg?: number;
  loggedAt: number;
}

export interface FactCheckResult {
  claim: string;
  verdict: "true" | "mostly_true" | "mixed" | "false" | "unverified";
  confidence: "high" | "medium" | "low";
  explanation: string;
  sources: Array<{ title: string; url: string }>;
}

export interface PendingCloudflareOp {
  id: string;
  action: "dns.upsert" | "cache.purge" | "worker.kv_put" | "pages.cutover_check";
  target: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  requestedBy: string;
  resolvedBy?: string;
  approvalToken: string;
  resultSummary?: string;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
}

export interface UsageRecord {
  id: string;
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costMicroUsd: number;
  createdAt: number;
}

export interface AiTrafficEvent {
  id: string;
  kind: "ai_referral" | "ai_crawler";
  source: string;
  path: string;
  userAgent: string;
  referer: string;
  alertDispatched: boolean;
  createdAt: number;
}

export interface CompanionDevice {
  deviceId: string;
  platform: "android" | "baileys" | "desktop";
  tunnelUrl: string;
  status: "online" | "offline";
  lastHeartbeatAt: number;
  queuedMessages: number;
}

export interface PlexiAuditReport {
  namespace: string;
  status: string;
  root: string | null;
  epoch: number | null;
  rootHashHex: string | null;
  lastVerifiedEpoch: number | null;
  logDirectory: string | null;
  signatureVersion: number | null;
  ciphersuite: number | null;
  validFormat: boolean;
  sourceMode: "live_plexi" | "snapshot_fallback";
  auditedAt: number;
  warnings: string[];
}

export interface UserMemoryState {
  userId: string;
  profile: Record<string, string>;
  workingHistory: Array<{ role: "user" | "assistant"; text: string; timestamp: number }>;
  episodicFacts: Array<{ id: string; fact: string; tags: string[]; createdAt: number }>;
}

export interface McpToolDefinition {
  name: string;
  module: string;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
}

export interface McpRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CuratedProject {
  rank: number;
  fullName: string;
  url: string;
  stars: number;
  language: string;
  license: string;
  pillar: string;
  waflareModule: string;
  summary: string;
  capabilitiesMerged: string[];
}
