import type { CatalogItem, ChatMessage, LeadContact } from "../types.ts";
import { HybridRagIndex } from "../retrieval/dualRetrieval.ts";

export interface SalesAssessment {
  score: number;
  tier: "cold" | "warm" | "hot";
  needsHumanHandoff: boolean;
  reasons: string[];
  recommendedProducts: CatalogItem[];
  suggestedReply: string;
}

/**
 * Deterministic BANT + buying-signal lead scorer and product recommender (ukimsanov/sagent pattern).
 */
export function assessSalesLead(
  contact: LeadContact,
  latestMessage: string,
  history: ChatMessage[],
  catalog: CatalogItem[]
): SalesAssessment {
  const combined = [latestMessage, ...history.slice(-6).map((m) => m.body)].join(" ").toLowerCase();
  let score = 20;
  const reasons: string[] = [];

  if (contact.ctwaReferral) {
    score += 15;
    reasons.push("CTWA ad click attribution (+15)");
  }
  if (/\b(harga|price|pricing|cost|budget|biaya|paket|bayar|invoice|beli|buy|order)\b/i.test(combined)) {
    score += 22;
    reasons.push("Pricing / purchase intent (+22)");
  }
  if (/\b(tim|team|admin|enterprise|perusahaan|company|users|agents|multi-tenant)\b/i.test(combined)) {
    score += 18;
    reasons.push("Multi-seat / team authority signal (+18)");
  }
  if (/\b(sekarang|today|urgent|minggu ini|demo|trial|deploy|pasang)\b/i.test(combined)) {
    score += 15;
    reasons.push("Urgent timeline signal (+15)");
  }

  const wantsHuman = /\b(human|agent|cs|sales|orang|bicara dengan|handoff|operator)\b/i.test(latestMessage);
  if (wantsHuman) {
    score += 20;
    reasons.push("Explicit human handoff request (+20)");
  }

  score = Math.min(100, score);
  contact.leadScore = Math.max(contact.leadScore, score);

  const tier: SalesAssessment["tier"] = score >= 75 ? "hot" : score >= 45 ? "warm" : "cold";
  const needsHumanHandoff = wantsHuman || score >= 80;

  const rag = new HybridRagIndex(catalog);
  const matched = rag.search(latestMessage, 2).map((r) => r.item);

  const recLines = matched.map((p) => `- ${p.title} ($${p.priceUsd}): ${p.summary}`).join("\n");
  const suggestedReply = needsHumanHandoff
    ? `Skor prospek Anda ${score}/100 (${tier.toUpperCase()}). Saya meneruskan percakapan ini ke tim sales kami dan menyertakan rekomendasi:\n${recLines}`
    : `Berikut rekomendasi terbaik untuk kebutuhan Anda:\n${recLines}`;

  return {
    score,
    tier,
    needsHumanHandoff,
    reasons,
    recommendedProducts: matched,
    suggestedReply
  };
}
