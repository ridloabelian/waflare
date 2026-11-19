import type { WaflareStore } from "../state/store.ts";
import type { Env, InboundEnvelope } from "../types.ts";
import { CrmInboxEngine } from "../crm/inbox.ts";
import { AntiBanThrottler } from "../gateway/throttler.ts";
import { WebhookMultiplexer } from "../gateway/multiplexer.ts";
import { executeDualSqlQuery, HybridRagIndex } from "../retrieval/dualRetrieval.ts";
import { assessSalesLead } from "../skills/salesAgent.ts";
import { parseAndLogFitnessMessage } from "../skills/fitnessLogger.ts";
import { formatFactCheckReply, verifyClaim } from "../skills/factChecker.ts";
import { convertCurrencyCommand } from "../skills/currencySkill.ts";
import { transcribeVoiceNote, synthesizeVoiceReply } from "../voice/audioPipeline.ts";
import { ApprovalGate } from "../ops/approvalGate.ts";
import { auditWhatsAppKeyTransparency } from "../security/plexiAuditor.ts";
import { encryptVaultPayload } from "../security/vault.ts";
import { LLMProviderRouter } from "../ai/providerRouter.ts";
import { UsageLedger } from "../ai/usageLedger.ts";
import { MemoryManager } from "./memory.ts";
import { formatGlassesCard, pushGlassesHudEntry } from "../channels/glassesHud.ts";

export interface AgentRuntime {
  store: WaflareStore;
  crm: CrmInboxEngine;
  throttler: AntiBanThrottler;
  multiplexer: WebhookMultiplexer;
  approvalGate: ApprovalGate;
  llmRouter: LLMProviderRouter;
  usageLedger: UsageLedger;
  memory: MemoryManager;
}

export function createAgentRuntime(store: WaflareStore): AgentRuntime {
  return {
    store,
    crm: new CrmInboxEngine(store),
    throttler: new AntiBanThrottler(),
    multiplexer: new WebhookMultiplexer(store),
    approvalGate: new ApprovalGate(store),
    llmRouter: new LLMProviderRouter(),
    usageLedger: new UsageLedger(store),
    memory: new MemoryManager(store)
  };
}

export interface OrchestratorResult {
  agentUsed: string;
  reply: string;
  hudCard: string;
  buttons?: Array<{ id: string; title: string }>;
  metadata: Record<string, unknown>;
}

/**
 * Multi-agent orchestrator & slash-command router unifying ClopinetteAI, Pulso, Forja, Sagent,
 * Kapso SQL/RAG, Fitness, Fact-Checker, Voice Transcription, Approval-Gated Ops, and Plexi Audit.
 */
export async function processInboundEnvelope(
  envelope: InboundEnvelope,
  runtime: AgentRuntime,
  env: Env
): Promise<OrchestratorResult> {
  const { crm, store, throttler, approvalGate, llmRouter, usageLedger, memory } = runtime;

  const { contact, optedOutTriggered, automationsTriggered } = crm.upsertContactFromInbound(envelope);

  if (optedOutTriggered) {
    const reply = "Anda telah berhasil berhenti berlangganan (STOP). Nomor Anda dikecualikan dari semua broadcast.";
    crm.recordOutboundMessage(contact.id, reply, { channel: envelope.channel });
    return {
      agentUsed: "ComplianceGuard",
      reply,
      hudCard: formatGlassesCard("OPT-OUT", reply),
      metadata: { optedOut: true }
    };
  }

  let effectiveText = envelope.text.trim();
  let voiceTranscript: string | undefined;

  if (envelope.kind === "audio") {
    const stt = await transcribeVoiceNote(
      { audioBase64: envelope.audioBase64, hintText: envelope.text },
      env
    );
    voiceTranscript = stt.transcript;
    effectiveText = stt.transcript;
  }

  memory.appendTurn(contact.phone, "user", effectiveText, envelope.timestamp);

  // Interactive Approval-Gate callback handling (ops_approve:<id> / ops_reject:<id>)
  const callbackText = envelope.interactiveReplyId ?? effectiveText;
  const opsDecisionMatch = /^ops_(approve|reject):([a-zA-Z0-9_-]+)$/i.exec(callbackText.trim());
  if (opsDecisionMatch) {
    const decision = opsDecisionMatch[1].toLowerCase() as "approve" | "reject";
    const opId = opsDecisionMatch[2];
    const resolved = await approvalGate.resolveOperation(opId, decision, contact.phone, env);
    await finalizeReply(contact.id, envelope, resolved.message, runtime, env);
    return {
      agentUsed: "CloudflareOpsAgent",
      reply: resolved.message,
      hudCard: formatGlassesCard("CF-OPS", resolved.message),
      metadata: { op: resolved.op, decision }
    };
  }

  // Budget check before invoking AI pipelines
  const budgetCap = Number(env.USER_BUDGET_MICRO_USD ?? "5000000");
  if (!usageLedger.canAfford(contact.phone, budgetCap)) {
    const budgetMsg = "Pay-per-use AI budget cap reached for this account. Top up or raise USER_BUDGET_MICRO_USD.";
    await finalizeReply(contact.id, envelope, budgetMsg, runtime, env);
    return {
      agentUsed: "UsageLedgerGuard",
      reply: budgetMsg,
      hudCard: formatGlassesCard("BUDGET", budgetMsg),
      metadata: { budgetExceeded: true }
    };
  }

  let agentUsed = "Orchestrator";
  let reply = "";
  let buttons: Array<{ id: string; title: string }> | undefined;
  const extraMeta: Record<string, unknown> = {
    automationsTriggered,
    voiceTranscript
  };

  const lower = effectiveText.toLowerCase();

  if (lower === "/help" || lower === "help") {
    agentUsed = "HelpRouter";
    reply = [
      "Waflare Unified Commands:",
      "- /sql <query or SELECT ...> : Guardrailed D1/Catalog Text-to-SQL",
      "- /rag <question> : Hybrid BM25 + Cosine RAG search",
      "- /verify <claim> : Fact-check claim with sources",
      "- /fitness <run/meal/weight or summary> : Log or summarize fitness",
      "- /fx <amount> <FROM> <TO> : Currency pair rate converter",
      "- /ops <cache.purge|dns.upsert> <target> : Request approval-gated Cloudflare op",
      "- /audit-e2ee : Audit WhatsApp Key Transparency via Cloudflare Plexi",
      "- /memory [query] : Inspect recalled user memory & profile",
      "- /handoff : Escalate immediately to human team inbox"
    ].join("\n");
  } else if (lower.startsWith("/sql")) {
    agentUsed = "SqlRetrievalAgent";
    const query = effectiveText.replace(/^\/sql\s*/i, "").trim() || "books";
    const sqlRes = await executeDualSqlQuery(query, store.catalog, env.DB);
    extraMeta.sqlResult = sqlRes;
    if (!sqlRes.valid) {
      reply = `SQL Guardrail Blocked: ${sqlRes.error}`;
    } else if (sqlRes.rows.length === 0) {
      reply = `SQL (${sqlRes.sql}) returned 0 rows.`;
    } else {
      const formatted = sqlRes.rows
        .map((r) => `- ${String(r.title)} (${String(r.sku)}) — $${String(r.price_usd)} ★${String(r.rating)}`)
        .join("\n");
      reply = `SQL Query:\n${sqlRes.sql}\n\nResults (${sqlRes.rows.length}):\n${formatted}`;
    }
  } else if (lower.startsWith("/rag")) {
    agentUsed = "RagRetrievalAgent";
    const query = effectiveText.replace(/^\/rag\s*/i, "").trim() || "cloudflare whatsapp";
    const rag = new HybridRagIndex(store.catalog);
    const hits = rag.search(query, 3);
    extraMeta.ragHits = hits;
    reply =
      `Hybrid RAG (BM25 + Cosine) for "${query}":\n` +
      hits
        .map((h, i) => `${i + 1}. ${h.item.title} ($${h.item.priceUsd}, score=${h.score}) — ${h.item.summary}`)
        .join("\n");
  } else if (lower.startsWith("/verify")) {
    agentUsed = "FactCheckAgent";
    const res = verifyClaim(store, effectiveText);
    extraMeta.factCheck = res;
    reply = formatFactCheckReply(res);
  } else if (lower.startsWith("/fitness")) {
    agentUsed = "FitnessAgent";
    const res = parseAndLogFitnessMessage(store, contact.phone, effectiveText, envelope.timestamp);
    extraMeta.fitnessEntry = res.entry;
    reply = res.reply;
  } else if (lower.startsWith("/fx")) {
    agentUsed = "CurrencyAgent";
    const fx = convertCurrencyCommand(effectiveText);
    extraMeta.fx = fx;
    reply = fx.reply;
  } else if (lower.startsWith("/ops")) {
    agentUsed = "CloudflareOpsAgent";
    const parts = effectiveText.replace(/^\/ops\s*/i, "").trim().split(/\s+/);
    const rawAction = parts[0] ?? "cache.purge";
    const action =
      rawAction === "dns.upsert" || rawAction === "worker.kv_put" || rawAction === "pages.cutover_check"
        ? rawAction
        : "cache.purge";
    const target = parts[1] ?? "https://waflare.workers.dev/*";
    const reqOp = approvalGate.requestOperation({
      action,
      target,
      requestedBy: contact.phone,
      payload: { source: "whatsapp_slash" }
    });
    buttons = reqOp.whatsappButtons;
    extraMeta.pendingOp = reqOp.op;
    reply = reqOp.promptText;
  } else if (lower.startsWith("/audit-e2ee")) {
    agentUsed = "PlexiAuditorAgent";
    const report = await auditWhatsAppKeyTransparency({
      plexiBaseUrl: env.PLEXI_URL,
      fetchImpl: env.fetchImpl
    });
    extraMeta.plexiAudit = report;
    reply = [
      `Cloudflare Plexi E2EE Audit (${report.namespace})`,
      `Status: ${report.status} | Mode: ${report.sourceMode} | Format Valid: ${report.validFormat}`,
      `Epoch: ${report.epoch ?? "-"} | Last Verified: ${report.lastVerifiedEpoch ?? "-"}`,
      `Root Hash: ${report.rootHashHex ? report.rootHashHex.slice(0, 24) + "..." : "none"}`
    ].join("\n");
  } else if (lower.startsWith("/memory")) {
    agentUsed = "MemoryAgent";
    const query = effectiveText.replace(/^\/memory\s*/i, "").trim();
    const facts = memory.recallFacts(contact.phone, query, 5);
    const memState = memory.getOrCreate(contact.phone);
    extraMeta.memory = memState;
    reply = `Memory for ${contact.name} (${memState.workingHistory.length} turns, ${memState.episodicFacts.length} facts):\nProfile: ${JSON.stringify(memState.profile)}\nFacts: ${facts.length ? facts.join(" | ") : "none"}`;
  } else if (lower.startsWith("/handoff") || /\b(human|operator|cs|sales person)\b/i.test(lower)) {
    agentUsed = "SalesHandoffAgent";
    const sales = assessSalesLead(contact, effectiveText, store.messages, store.catalog);
    crm.moveStage(contact.id, "proposal", "human-queue", "Escalated via WhatsApp handoff.");
    extraMeta.sales = sales;
    reply = sales.suggestedReply;
  } else if (/\b(harga|price|beli|buy|paket|produk|product|buku|book|crm|mcp)\b/i.test(lower)) {
    agentUsed = "SalesAgent";
    const sales = assessSalesLead(contact, effectiveText, store.messages, store.catalog);
    extraMeta.sales = sales;
    reply = sales.suggestedReply;
  } else if (automationsTriggered.some((a) => a.sideEffectsApplied)) {
    agentUsed = "AutomationEngine";
    reply = automationsTriggered.find((a) => a.sideEffectsApplied)?.renderedReply ?? "OK";
  } else {
    agentUsed = "MultiLlmAgent";
    const recalled = memory.recallFacts(contact.phone, effectiveText, 3);
    const llm = await llmRouter.complete(
      {
        systemPrompt: `You are Waflare, a helpful WhatsApp & Cloudflare AI assistant. Recalled user facts: ${recalled.join("; ") || "none"}.`,
        userPrompt: effectiveText
      },
      env
    );
    const usageRec = usageLedger.record({
      userId: contact.phone,
      provider: llm.provider,
      model: llm.model,
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens
    });
    extraMeta.llm = { provider: llm.provider, model: llm.model, failoverChain: llm.failoverChain, usage: usageRec };
    reply = llm.text;
  }

  if (voiceTranscript) {
    const voiceSynth = await synthesizeVoiceReply(reply, env);
    extraMeta.voiceSynthesis = voiceSynth;
    reply = `[Voice Transcript]: "${voiceTranscript}"\n\n${reply}`;
  }

  const throttle = throttler.consume(envelope.tenantId, contact.phone, reply);
  extraMeta.throttle = throttle;

  await finalizeReply(contact.id, envelope, reply, runtime, env);

  const hudCard = formatGlassesCard(agentUsed, reply);
  pushGlassesHudEntry(store, `${contact.name}: ${hudCard}`, Date.now());

  return {
    agentUsed,
    reply,
    hudCard,
    buttons,
    metadata: extraMeta
  };
}

async function finalizeReply(
  contactId: string,
  envelope: InboundEnvelope,
  replyText: string,
  runtime: AgentRuntime,
  env: Env
): Promise<void> {
  let encryptedPayload: string | undefined;
  if (env.VAULT_PASSPHRASE && env.VAULT_PASSPHRASE.length >= 8) {
    encryptedPayload = await encryptVaultPayload(replyText, env.VAULT_PASSPHRASE);
  }
  runtime.crm.recordOutboundMessage(contactId, replyText, {
    channel: envelope.channel,
    encryptedPayload
  });
  runtime.memory.appendTurn(envelope.senderId, "assistant", replyText);
}
