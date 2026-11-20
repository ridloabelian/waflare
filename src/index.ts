import type { AlertTrafficMode, ChannelKind, Env, InboundEnvelope } from "./types.ts";
import { CURATED_PROJECTS } from "./data/curationCatalog.ts";
import { WaflareStore } from "./state/store.ts";
import { createAgentRuntime, processInboundEnvelope } from "./agents/orchestrator.ts";
import { handleMetaVerifyChallenge, parseMetaWebhook, verifyMetaSignature } from "./channels/metaWebhook.ts";
import { buildTwimlMessageResponse, parseFormUrlEncoded, parseTwilioFormWebhook, verifyTwilioSignature } from "./channels/twilioAdapter.ts";
import { normalizeOmnichannelWebhook } from "./channels/omnichannel.ts";
import { SentlyDispatcher } from "./channels/sentlySdk.ts";
import { CompanionBridge } from "./channels/companionBridge.ts";
import { renderGlassesHudHtml, formatGlassesCard, pushGlassesHudEntry } from "./channels/glassesHud.ts";
import { handleMcpRequest } from "./mcp/server.ts";
import { inspectAndAlertAiTraffic } from "./ops/aiTrafficMonitor.ts";
import { auditWhatsAppKeyTransparency } from "./security/plexiAuditor.ts";
import { renderDashboardHtml } from "./ui/dashboardHtml.ts";
import { ConversationSessionDO } from "./durable/sessionDO.ts";

export { ConversationSessionDO };

const MCP_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version"
};

/** Attach CORS headers required by Streamable HTTP MCP clients and inspectors. */
function withMcpCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export interface WaflareApp {
  store: WaflareStore;
  fetch(request: Request, env?: Env): Promise<Response>;
  scheduled(env?: Env): Promise<{ checkedDevices: number; cleanedOps: number }>;
}

export function createWaflareApp(initialStore?: WaflareStore): WaflareApp {
  const store = initialStore ?? new WaflareStore();
  const runtime = createAgentRuntime(store);
  const dispatcher = new SentlyDispatcher();
  const companionBridge = new CompanionBridge(store);

  return {
    store,

    async fetch(request: Request, env: Env = {}): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname;

      // Passive AI traffic inspection on page hits (surfacedby/ai-traffic-alerts-for-cloudflare)
      if (request.method === "GET" && (path === "/" || path === "/admin")) {
        await inspectAndAlertAiTraffic(request, store, dispatcher, env);
      }

      // 1. UI Surfaces
      if (request.method === "GET" && (path === "/" || path === "/admin")) {
        return new Response(renderDashboardHtml(), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      if (request.method === "GET" && path === "/glasses") {
        return new Response(renderGlassesHudHtml(store), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }

      // 2. Health & 27-Repo Curation Catalog
      if (request.method === "GET" && path === "/health") {
        return Response.json({
          ok: true,
          service: "waflare",
          curatedProjects: CURATED_PROJECTS.length,
          mcpReadOnly: (env.MCP_READ_ONLY ?? "false").toLowerCase() === "true",
          leadsCount: store.contacts.size,
          messagesCount: store.messages.length
        });
      }

      if (request.method === "GET" && path === "/ping") {
        return new Response("pong", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }

      if (request.method === "GET" && path === "/api/curation") {
        const pillar = url.searchParams.get("pillar");
        const projects = pillar
          ? CURATED_PROJECTS.filter((p) => p.pillar === pillar)
          : CURATED_PROJECTS;
        return Response.json({ total: projects.length, projects });
      }

      // 3. Streamable HTTP MCP Server (/mcp)
      if ((request.method === "OPTIONS" || request.method === "DELETE") && path === "/mcp") {
        return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
      }

      if (request.method === "POST" && path === "/mcp") {
        const roOverride = url.searchParams.get("readonly");
        const effectiveEnv: Env = roOverride === "true" ? { ...env, MCP_READ_ONLY: "true" } : env;
        return withMcpCors(await handleMcpRequest(request, runtime, effectiveEnv));
      }

      // 4. Meta WhatsApp Cloud API Webhook (GET verify + POST signed events)
      if (path === "/webhook" && request.method === "GET") {
        return handleMetaVerifyChallenge(url, env.WEBHOOK_VERIFY_TOKEN ?? "waflare-verify-token");
      }

      if (path === "/webhook" && request.method === "POST") {
        const rawBody = await request.text();
        if (env.WHATSAPP_APP_SECRET) {
          const sig = request.headers.get("x-hub-signature-256");
          const valid = await verifyMetaSignature(rawBody, sig, env.WHATSAPP_APP_SECRET);
          if (!valid) {
            return Response.json({ ok: false, error: "Invalid X-Hub-Signature-256" }, { status: 401 });
          }
        }
        const payload = JSON.parse(rawBody);
        const envelopes = parseMetaWebhook(payload);
        const processed = [];

        for (const envItem of envelopes) {
          const multiplex = await runtime.multiplexer.fanOut("whatsapp.inbound", envItem, env.fetchImpl);
          if (multiplex.deduplicated) continue;

          const outcome = await processInboundEnvelope(envItem, runtime, env);
          await dispatcher.send(
            {
              id: `reply_${crypto.randomUUID().slice(0, 8)}`,
              to: envItem.senderId,
              channel: "whatsapp",
              kind: outcome.buttons?.length ? "interactive_buttons" : "text",
              text: outcome.reply,
              buttons: outcome.buttons
            },
            env
          );
          processed.push({ messageId: envItem.messageId, agentUsed: outcome.agentUsed, reply: outcome.reply, multiplex });
        }
        return Response.json({ ok: true, processedCount: processed.length, processed });
      }

      // 5. Twilio WhatsApp Voice & Messaging Webhook
      if (path === "/webhook/twilio" && request.method === "POST") {
        const rawBody = await request.text();
        const params = parseFormUrlEncoded(rawBody);
        if (env.TWILIO_AUTH_TOKEN) {
          const sig = request.headers.get("x-twilio-signature");
          const valid = await verifyTwilioSignature(request.url, params, sig, env.TWILIO_AUTH_TOKEN);
          if (!valid) {
            return Response.json({ ok: false, error: "Invalid X-Twilio-Signature" }, { status: 401 });
          }
        }
        const envelope = parseTwilioFormWebhook(params);
        const outcome = await processInboundEnvelope(envelope, runtime, env);
        return buildTwimlMessageResponse(outcome.reply);
      }

      // 6. Omnichannel Webhook (Telegram, Instagram, Messenger)
      const omniMatch = /^\/webhook\/omnichannel\/(whatsapp|telegram|instagram|messenger)$/i.exec(path);
      if (omniMatch && request.method === "POST") {
        const channel = omniMatch[1].toLowerCase() as ChannelKind;
        const payload = await request.json();
        const envelopes = normalizeOmnichannelWebhook(channel, payload);
        const results = [];
        for (const envItem of envelopes) {
          results.push(await processInboundEnvelope(envItem, runtime, env));
        }
        return Response.json({ ok: true, channel, count: results.length, results });
      }

      // 7. OpenAI-Compatible Chat Completions Bridge
      if (path === "/v1/chat/completions" && request.method === "POST") {
        const body = (await request.json()) as {
          model?: string;
          messages?: Array<{ role?: string; content?: string }>;
          user?: string;
        };
        const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
        const llm = await runtime.llmRouter.complete(
          {
            systemPrompt: "You are Waflare OpenAI-compatible edge assistant.",
            userPrompt: lastUser
          },
          env
        );
        return Response.json({
          id: `chatcmpl_${crypto.randomUUID().slice(0, 10)}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: llm.model,
          choices: [{ index: 0, message: { role: "assistant", content: llm.text }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: llm.promptTokens,
            completion_tokens: llm.completionTokens,
            total_tokens: llm.promptTokens + llm.completionTokens
          }
        });
      }

      // 8. CRM, Agent Simulator, Glasses HUD & Ops APIs
      if (request.method === "GET" && path === "/api/crm/overview") {
        return Response.json({
          leads: runtime.crm.listLeads(),
          recentMessages: [...store.messages].slice(-12).reverse(),
          templates: runtime.multiplexer.listTemplates(),
          usage: runtime.usageLedger.summary()
        });
      }

      if (request.method === "POST" && path === "/api/crm/broadcast") {
        const body = (await request.json()) as { templateName?: string; tag?: string };
        return Response.json(
          runtime.crm.planPacedBroadcast(body.templateName ?? "reopen_support_window", body.tag)
        );
      }

      if (request.method === "POST" && path === "/api/agent/simulate") {
        const body = (await request.json()) as {
          senderId?: string;
          senderName?: string;
          kind?: InboundEnvelope["kind"];
          text?: string;
          interactiveReplyId?: string;
        };
        const envelope: InboundEnvelope = {
          messageId: `sim_${crypto.randomUUID().slice(0, 8)}`,
          tenantId: "default",
          channel: "whatsapp",
          senderId: body.senderId ?? "6281234567890",
          senderName: body.senderName ?? "Playground User",
          recipientNumber: "waflare-edge",
          kind: body.kind ?? "text",
          text: body.text ?? "/help",
          interactiveReplyId: body.interactiveReplyId,
          timestamp: Date.now()
        };
        const result = await processInboundEnvelope(envelope, runtime, env);
        return Response.json({ ok: true, ...result });
      }

      if (request.method === "POST" && path === "/api/glasses/command") {
        const body = (await request.json()) as { text?: string };
        const result = await processInboundEnvelope(
          {
            messageId: `glass_${crypto.randomUUID().slice(0, 8)}`,
            tenantId: "default",
            channel: "glasses",
            senderId: "glasses-owner",
            senderName: "Smart Glasses",
            recipientNumber: "waflare",
            kind: "text",
            text: body.text ?? "/audit-e2ee",
            timestamp: Date.now()
          },
          runtime,
          env
        );
        const card = formatGlassesCard(result.agentUsed, result.reply);
        pushGlassesHudEntry(store, card);
        return Response.json({ ok: true, hudCard: card, reply: result.reply });
      }

      if (request.method === "GET" && path === "/api/ops/list") {
        return Response.json({ operations: runtime.approvalGate.listOperations() });
      }

      if (request.method === "POST" && path === "/api/ops/request") {
        const body = (await request.json()) as {
          action?: "dns.upsert" | "cache.purge" | "worker.kv_put" | "pages.cutover_check";
          target?: string;
          requestedBy?: string;
          payload?: Record<string, unknown>;
        };
        return Response.json(
          runtime.approvalGate.requestOperation({
            action: body.action ?? "cache.purge",
            target: body.target ?? "https://waflare.workers.dev/*",
            requestedBy: body.requestedBy ?? "api",
            payload: body.payload
          })
        );
      }

      if (request.method === "POST" && path === "/api/ops/resolve") {
        const body = (await request.json()) as { opId: string; decision: "approve" | "reject"; actor?: string };
        return Response.json(
          await runtime.approvalGate.resolveOperation(body.opId, body.decision, body.actor ?? "owner", env)
        );
      }

      if (request.method === "GET" && path === "/api/security/key-transparency") {
        const report = await auditWhatsAppKeyTransparency({
          plexiBaseUrl: env.PLEXI_URL,
          fetchImpl: env.fetchImpl
        });
        return Response.json(report);
      }

      if (request.method === "POST" && path === "/api/traffic/inspect") {
        const body = (await request.json()) as {
          path?: string;
          referer?: string;
          userAgent?: string;
          alertMode?: AlertTrafficMode;
        };
        const headers = new Headers();
        if (body.referer) headers.set("referer", body.referer);
        if (body.userAgent) headers.set("user-agent", body.userAgent);
        const syntheticReq = new Request(`https://waflare.workers.dev${body.path ?? "/"}`, { headers });
        const result = await inspectAndAlertAiTraffic(syntheticReq, store, dispatcher, env, body.alertMode);
        return Response.json({ ok: true, ...result, totalEvents: store.aiTrafficEvents.length });
      }

      // 9. Mobile/Android/Baileys Cloudflare Tunnel Companion API
      if (request.method === "POST" && path === "/api/companion/heartbeat") {
        const body = (await request.json()) as {
          deviceId: string;
          platform: "android" | "baileys" | "desktop";
          tunnelUrl: string;
        };
        return Response.json({ ok: true, device: companionBridge.registerHeartbeat(body) });
      }

      if (request.method === "GET" && path === "/api/companion/devices") {
        return Response.json({ devices: companionBridge.listDevices() });
      }

      if (request.method === "POST" && path === "/api/companion/enqueue") {
        const body = (await request.json()) as { deviceId: string; to: string; text: string };
        return Response.json({ ok: true, job: companionBridge.enqueueForCompanion(body.deviceId, body.to, body.text) });
      }

      if (request.method === "POST" && path === "/api/companion/drain") {
        const body = (await request.json()) as { deviceId: string };
        return Response.json({ ok: true, jobs: companionBridge.drainJobs(body.deviceId) });
      }

      return Response.json({ ok: false, error: `Route not found: ${request.method} ${path}` }, { status: 404 });
    },

    async scheduled(_env: Env = {}): Promise<{ checkedDevices: number; cleanedOps: number }> {
      const now = Date.now();
      let cleanedOps = 0;
      for (const op of store.pendingOps.values()) {
        if (op.status === "pending" && now > op.expiresAt) {
          op.status = "expired";
          cleanedOps += 1;
        }
      }
      return {
        checkedDevices: companionBridge.listDevices(now).length,
        cleanedOps
      };
    }
  };
}

const defaultApp = createWaflareApp();

export default {
  fetch(request: Request, env: Env = {}): Promise<Response> {
    return defaultApp.fetch(request, env);
  },
  scheduled(_controller: unknown, env: Env = {}): Promise<unknown> {
    return defaultApp.scheduled(env);
  }
};
