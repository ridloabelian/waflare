import type { WaflareStore } from "../state/store.ts";
import type { AiTrafficEvent, AlertTrafficMode, Env, SentlyChannel } from "../types.ts";
import { SentlyDispatcher } from "../channels/sentlySdk.ts";

const AI_REFERRER_DOMAINS: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /(?:^|\.)chatgpt\.com$/i, name: "ChatGPT" },
  { pattern: /(?:^|\.)chat\.openai\.com$/i, name: "ChatGPT" },
  { pattern: /(?:^|\.)perplexity\.ai$/i, name: "Perplexity" },
  { pattern: /(?:^|\.)claude\.ai$/i, name: "Claude" },
  { pattern: /(?:^|\.)gemini\.google\.com$/i, name: "Gemini" },
  { pattern: /(?:^|\.)copilot\.microsoft\.com$/i, name: "Copilot" },
  { pattern: /(?:^|\.)grok\.com$/i, name: "Grok" }
];

const AI_CRAWLER_SIGNATURES: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /GPTBot/i, name: "GPTBot" },
  { pattern: /OAI-SearchBot/i, name: "OAI-SearchBot" },
  { pattern: /ChatGPT-User/i, name: "ChatGPT-User" },
  { pattern: /ClaudeBot/i, name: "ClaudeBot" },
  { pattern: /anthropic-ai/i, name: "Anthropic-AI" },
  { pattern: /PerplexityBot/i, name: "PerplexityBot" },
  { pattern: /Google-Extended/i, name: "Google-Extended" },
  { pattern: /Bytespider/i, name: "Bytespider" }
];

export function classifyAiTraffic(request: Request): {
  kind: "ai_referral" | "ai_crawler" | null;
  source: string | null;
  path: string;
  userAgent: string;
  referer: string;
} {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") ?? "";
  const referer = request.headers.get("referer") ?? request.headers.get("referrer") ?? "";

  if (referer) {
    try {
      const refHost = new URL(referer).hostname;
      for (const entry of AI_REFERRER_DOMAINS) {
        if (entry.pattern.test(refHost)) {
          return {
            kind: "ai_referral",
            source: entry.name,
            path: url.pathname,
            userAgent,
            referer
          };
        }
      }
    } catch {
      // Ignore malformed Referer header
    }
  }

  for (const bot of AI_CRAWLER_SIGNATURES) {
    if (bot.pattern.test(userAgent)) {
      return {
        kind: "ai_crawler",
        source: bot.name,
        path: url.pathname,
        userAgent,
        referer
      };
    }
  }

  return { kind: null, source: null, path: url.pathname, userAgent, referer };
}

/**
 * Inspects inbound HTTP requests for AI assistant referrals or AI crawlers
 * and alerts via WhatsApp / ntfy / Telegram / Discord (surfacedby/ai-traffic-alerts-for-cloudflare).
 */
export async function inspectAndAlertAiTraffic(
  request: Request,
  store: WaflareStore,
  dispatcher: SentlyDispatcher,
  env: Env,
  modeOverride?: AlertTrafficMode
): Promise<{ detected: boolean; event?: AiTrafficEvent; alerted: boolean }> {
  const cls = classifyAiTraffic(request);
  if (!cls.kind || !cls.source) {
    return { detected: false, alerted: false };
  }

  const rawMode = (modeOverride ?? env.ALERT_ON ?? "referrals").toLowerCase();
  const alertMode: AlertTrafficMode =
    rawMode === "crawlers" || rawMode === "both" ? rawMode : "referrals";

  const shouldAlert =
    alertMode === "both" ||
    (alertMode === "referrals" && cls.kind === "ai_referral") ||
    (alertMode === "crawlers" && cls.kind === "ai_crawler");

  let alerted = false;
  if (shouldAlert) {
    const channel = (env.OWNER_ALERT_CHANNEL ?? "whatsapp") as SentlyChannel;
    const target = env.OWNER_ALERT_TARGET ?? "owner";
    const label = cls.kind === "ai_referral" ? "AI Visitor Referral" : "AI Crawler Hit";
    const receipt = await dispatcher.send(
      {
        id: `traffic_${crypto.randomUUID().slice(0, 8)}`,
        to: target,
        channel,
        kind: "text",
        text: `[${label}] ${cls.source} -> ${cls.path}`
      },
      env
    );
    alerted = receipt.delivered;
  }

  const event: AiTrafficEvent = {
    id: `evt_${crypto.randomUUID().slice(0, 8)}`,
    kind: cls.kind,
    source: cls.source,
    path: cls.path,
    userAgent: cls.userAgent,
    referer: cls.referer,
    alertDispatched: alerted,
    createdAt: Date.now()
  };
  store.aiTrafficEvents.unshift(event);
  if (store.aiTrafficEvents.length > 50) {
    store.aiTrafficEvents.length = 50;
  }

  return { detected: true, event, alerted };
}
