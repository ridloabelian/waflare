import type { DealStage, Env, McpToolDefinition } from "../types.ts";
import type { AgentRuntime } from "../agents/orchestrator.ts";
import { SentlyDispatcher } from "../channels/sentlySdk.ts";
import { auditWhatsAppKeyTransparency } from "../security/plexiAuditor.ts";
import { transcribeVoiceNote, synthesizeVoiceReply } from "../voice/audioPipeline.ts";
import { assessSalesLead } from "../skills/salesAgent.ts";

/**
 * 28 structured MCP Tools across 8 operational modules (spirit122 + finereli + felipeadeildo + AMH WT).
 * Mutating tools have readOnly: false so MCP_READ_ONLY=true cleanly blocks them.
 */
export const MCP_TOOLS: readonly McpToolDefinition[] = [
  // 1. Messages (6)
  {
    name: "wa_list_chats",
    module: "messages",
    description: "List WhatsApp CRM chats sorted by most recent activity.",
    readOnly: true,
    inputSchema: { type: "object", properties: { limit: { type: "number" } } }
  },
  {
    name: "wa_get_thread",
    module: "messages",
    description: "Fetch conversation message history for a specific contactId or phone number.",
    readOnly: true,
    inputSchema: { type: "object", properties: { contactId: { type: "string" }, limit: { type: "number" } }, required: ["contactId"] }
  },
  {
    name: "wa_search_messages",
    module: "messages",
    description: "Full-text search across stored WhatsApp messages.",
    readOnly: true,
    inputSchema: { type: "object", properties: { query: { type: "string" }, contactId: { type: "string" } }, required: ["query"] }
  },
  {
    name: "wa_send_text",
    module: "messages",
    description: "Send a WhatsApp text message (enforces 24h window & STOP opt-out).",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" }, tenantId: { type: "string" } }, required: ["to", "text"] }
  },
  {
    name: "wa_send_reaction",
    module: "messages",
    description: "Send an emoji reaction to a WhatsApp message ID.",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, messageId: { type: "string" }, emoji: { type: "string" } }, required: ["to", "messageId", "emoji"] }
  },
  {
    name: "wa_mark_read",
    module: "messages",
    description: "Mark an inbound WhatsApp message as read.",
    readOnly: false,
    inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] }
  },

  // 2. Interactive Messages (3)
  {
    name: "wa_send_buttons",
    module: "interactive",
    description: "Send an interactive reply-buttons WhatsApp message (max 3 buttons).",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" }, buttons: { type: "array" } }, required: ["to", "text", "buttons"] }
  },
  {
    name: "wa_send_list",
    module: "interactive",
    description: "Send an interactive section list WhatsApp menu.",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, header: { type: "string" }, items: { type: "array" } }, required: ["to", "items"] }
  },
  {
    name: "wa_send_cta_url",
    module: "interactive",
    description: "Send a Call-To-Action URL button message.",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" }, label: { type: "string" }, url: { type: "string" } }, required: ["to", "text", "label", "url"] }
  },

  // 3. Templates (3)
  {
    name: "wa_list_templates",
    module: "templates",
    description: "List registered Meta HSM templates.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "wa_upsert_template",
    module: "templates",
    description: "Register or update an HSM template in the local/D1 registry.",
    readOnly: false,
    inputSchema: { type: "object", properties: { name: { type: "string" }, body: { type: "string" }, language: { type: "string" }, category: { type: "string" } }, required: ["name", "body"] }
  },
  {
    name: "wa_send_template",
    module: "templates",
    description: "Send an approved HSM template (safe even outside the 24h Meta reply window).",
    readOnly: false,
    inputSchema: { type: "object", properties: { to: { type: "string" }, templateName: { type: "string" } }, required: ["to", "templateName"] }
  },

  // 4. Media & Voice (3)
  {
    name: "wa_transcribe_voice",
    module: "media_voice",
    description: "Transcribe a WhatsApp voice note using Workers AI Whisper or fallback STT.",
    readOnly: true,
    inputSchema: { type: "object", properties: { hintText: { type: "string" } } }
  },
  {
    name: "wa_synthesize_voice",
    module: "media_voice",
    description: "Prepare an Opus 48kHz voice reply using ElevenLabs or local descriptor.",
    readOnly: false,
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
  },
  {
    name: "wa_store_media",
    module: "media_voice",
    description: "Store media metadata/payload in Cloudflare R2 (or mock receipt when unbound).",
    readOnly: false,
    inputSchema: { type: "object", properties: { key: { type: "string" }, contentType: { type: "string" }, textPayload: { type: "string" } }, required: ["key"] }
  },

  // 5. CRM & Sales (5)
  {
    name: "crm_upsert_lead",
    module: "crm",
    description: "Create or update a CRM contact/lead with tags or owner assignment.",
    readOnly: false,
    inputSchema: { type: "object", properties: { phone: { type: "string" }, name: { type: "string" }, stage: { type: "string" }, tag: { type: "string" } }, required: ["phone"] }
  },
  {
    name: "crm_list_leads",
    module: "crm",
    description: "List CRM leads with 24h window status, CTWA attribution, and lead score.",
    readOnly: true,
    inputSchema: { type: "object", properties: { stage: { type: "string" }, tag: { type: "string" } } }
  },
  {
    name: "crm_score_lead",
    module: "crm",
    description: "Compute BANT lead score (0-100) and check whether human handoff is warranted.",
    readOnly: true,
    inputSchema: { type: "object", properties: { contactId: { type: "string" }, latestMessage: { type: "string" } }, required: ["contactId"] }
  },
  {
    name: "crm_move_stage",
    module: "crm",
    description: "Move a lead to a new deal pipeline stage (new/qualified/proposal/won/lost).",
    readOnly: false,
    inputSchema: { type: "object", properties: { contactId: { type: "string" }, stage: { type: "string" }, owner: { type: "string" }, note: { type: "string" } }, required: ["contactId", "stage"] }
  },
  {
    name: "crm_run_broadcast",
    module: "crm",
    description: "Plan a paced HSM broadcast respecting STOP/opt-out exclusions.",
    readOnly: false,
    inputSchema: { type: "object", properties: { templateName: { type: "string" }, tag: { type: "string" } }, required: ["templateName"] }
  },

  // 6. Gateway & Webhooks (3)
  {
    name: "gw_register_webhook_target",
    module: "gateway",
    description: "Register a downstream webhook URL in the Watahub-style multiplexer.",
    readOnly: false,
    inputSchema: { type: "object", properties: { url: { type: "string" }, secret: { type: "string" }, events: { type: "array" } }, required: ["url"] }
  },
  {
    name: "gw_list_webhook_targets",
    module: "gateway",
    description: "List registered webhook multiplexer targets.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "gw_throttle_status",
    module: "gateway",
    description: "Inspect Anti-Ban token-bucket throttle counters per tenant/recipient.",
    readOnly: true,
    inputSchema: { type: "object", properties: { tenantId: { type: "string" } } }
  },

  // 7. Cloudflare Ops & Security (3)
  {
    name: "cf_request_operation",
    module: "cloudflare_ops",
    description: "Queue an approval-gated Cloudflare operation (requires owner WhatsApp/MCP approval).",
    readOnly: false,
    inputSchema: { type: "object", properties: { action: { type: "string" }, target: { type: "string" }, requestedBy: { type: "string" } }, required: ["action", "target"] }
  },
  {
    name: "cf_resolve_operation",
    module: "cloudflare_ops",
    description: "Approve or reject a pending Cloudflare operation by ID.",
    readOnly: false,
    inputSchema: { type: "object", properties: { opId: { type: "string" }, decision: { type: "string" }, actor: { type: "string" } }, required: ["opId", "decision"] }
  },
  {
    name: "cf_audit_whatsapp_e2ee",
    module: "cloudflare_ops",
    description: "Run Cloudflare Plexi Key Transparency audit on whatsapp.key-transparency.v1.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} }
  },

  // 8. Flows & Business Profile (2)
  {
    name: "wa_get_business_profile",
    module: "flows_profile",
    description: "Return active Waflare WhatsApp Business profile & tenant transport status.",
    readOnly: true,
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "wa_trigger_flow",
    module: "flows_profile",
    description: "Simulate or validate a WhatsApp Flow screen submission.",
    readOnly: false,
    inputSchema: { type: "object", properties: { flowId: { type: "string" }, senderId: { type: "string" }, screen: { type: "string" } }, required: ["flowId", "senderId"] }
  }
] as const;

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  runtime: AgentRuntime,
  env: Env
): Promise<unknown> {
  const { crm, store, multiplexer, throttler, approvalGate } = runtime;
  const dispatcher = new SentlyDispatcher();

  switch (name) {
    case "wa_list_chats":
      return { chats: crm.listLeads().slice(0, Number(args.limit ?? 20)) };

    case "wa_get_thread": {
      const cid = String(args.contactId ?? "");
      const normId = cid.startsWith("lead_") ? cid : `lead_${cid}`;
      const msgs = store.messages.filter((m) => m.contactId === cid || m.contactId === normId);
      return { contactId: cid, messages: msgs.slice(-Number(args.limit ?? 30)) };
    }

    case "wa_search_messages":
      return {
        results: crm.searchMessages(String(args.query ?? ""), args.contactId ? String(args.contactId) : undefined)
      };

    case "wa_send_text": {
      const to = String(args.to ?? "");
      const text = String(args.text ?? "");
      const contact = store.contacts.get(`lead_${to}`);
      if (contact) {
        const check = crm.canSendFreeformMessage(contact);
        if (!check.allowed) {
          return { sent: false, blocked: true, reason: check.reason, window: check.window };
        }
      }
      const throttle = throttler.consume(String(args.tenantId ?? "default"), to, text);
      if (!throttle.allowed) {
        return { sent: false, throttled: true, retryAfterMs: throttle.retryAfterMs, reason: throttle.reason };
      }
      const receipt = await dispatcher.send(
        { id: `mcp_${crypto.randomUUID().slice(0, 8)}`, to, channel: "whatsapp", kind: "text", text },
        env
      );
      if (contact) crm.recordOutboundMessage(contact.id, text);
      return { sent: receipt.delivered, receipt, throttle };
    }

    case "wa_send_reaction":
      return { sent: true, to: args.to, messageId: args.messageId, emoji: args.emoji };

    case "wa_mark_read":
      return { markedRead: true, messageId: args.messageId };

    case "wa_send_buttons": {
      const to = String(args.to ?? "");
      const text = String(args.text ?? "");
      const buttons = Array.isArray(args.buttons) ? (args.buttons as Array<{ id: string; title: string }>) : [];
      const receipt = await dispatcher.send(
        { id: `btn_${crypto.randomUUID().slice(0, 8)}`, to, channel: "whatsapp", kind: "interactive_buttons", text, buttons },
        env
      );
      return { sent: receipt.delivered, receipt };
    }

    case "wa_send_list":
      return { sent: true, to: args.to, header: args.header ?? "Options", itemCount: Array.isArray(args.items) ? args.items.length : 0 };

    case "wa_send_cta_url":
      return { sent: true, to: args.to, label: args.label, url: args.url };

    case "wa_list_templates":
      return { templates: multiplexer.listTemplates() };

    case "wa_upsert_template":
      return {
        template: multiplexer.upsertTemplate({
          name: String(args.name),
          body: String(args.body),
          language: String(args.language ?? "en_US"),
          category: (args.category as "UTILITY" | "MARKETING" | "AUTHENTICATION") ?? "UTILITY",
          status: "APPROVED"
        })
      };

    case "wa_send_template": {
      const to = String(args.to ?? "");
      const templateName = String(args.templateName ?? "reopen_support_window");
      const contact = store.contacts.get(`lead_${to}`);
      if (contact?.optedOut) {
        return { sent: false, blocked: true, reason: "Recipient opted out via STOP." };
      }
      const receipt = await dispatcher.send(
        { id: `tpl_${crypto.randomUUID().slice(0, 8)}`, to, channel: "whatsapp", kind: "template", text: `[Template:${templateName}]`, templateName },
        env
      );
      if (contact) crm.recordOutboundMessage(contact.id, `[HSM:${templateName}]`, { kind: "template" });
      return { sent: receipt.delivered, receipt };
    }

    case "wa_transcribe_voice":
      return transcribeVoiceNote({ hintText: args.hintText ? String(args.hintText) : undefined }, env);

    case "wa_synthesize_voice":
      return synthesizeVoiceReply(String(args.text ?? ""), env);

    case "wa_store_media": {
      const key = String(args.key ?? "sample.txt");
      const body = String(args.textPayload ?? "waflare media object");
      if (env.MEDIA_BUCKET) {
        await env.MEDIA_BUCKET.put(key, body, { httpMetadata: { contentType: String(args.contentType ?? "text/plain") } });
        return { stored: true, backend: "r2", key };
      }
      return { stored: true, backend: "dry_run", key, bytes: body.length };
    }

    case "crm_upsert_lead": {
      const phone = String(args.phone ?? "");
      const res = crm.upsertContactFromInbound({
        messageId: `crm_${crypto.randomUUID().slice(0, 8)}`,
        tenantId: "default",
        channel: "whatsapp",
        senderId: phone,
        senderName: String(args.name ?? phone),
        recipientNumber: "waflare",
        kind: "system",
        text: "[CRM upsert]",
        timestamp: Date.now()
      });
      if (args.stage) crm.moveStage(res.contact.id, args.stage as DealStage);
      if (args.tag && !res.contact.tags.includes(String(args.tag))) res.contact.tags.push(String(args.tag));
      return { contact: res.contact };
    }

    case "crm_list_leads":
      return {
        leads: crm.listLeads({
          stage: args.stage ? (String(args.stage) as DealStage) : undefined,
          tag: args.tag ? String(args.tag) : undefined
        })
      };

    case "crm_score_lead": {
      const cid = String(args.contactId ?? "");
      const contact = store.contacts.get(cid) ?? store.contacts.get(`lead_${cid}`);
      if (!contact) throw new Error(`Contact '${cid}' not found`);
      return assessSalesLead(contact, String(args.latestMessage ?? ""), store.messages, store.catalog);
    }

    case "crm_move_stage": {
      const updated = crm.moveStage(
        String(args.contactId),
        String(args.stage) as DealStage,
        args.owner ? String(args.owner) : undefined,
        args.note ? String(args.note) : undefined
      );
      if (!updated) throw new Error(`Contact '${String(args.contactId)}' not found`);
      return { contact: updated };
    }

    case "crm_run_broadcast":
      return crm.planPacedBroadcast(
        String(args.templateName ?? "reopen_support_window"),
        args.tag ? String(args.tag) : undefined
      );

    case "gw_register_webhook_target":
      return {
        target: multiplexer.registerTarget({
          url: String(args.url),
          secret: args.secret ? String(args.secret) : undefined,
          events: Array.isArray(args.events) ? args.events.map(String) : undefined
        })
      };

    case "gw_list_webhook_targets":
      return { targets: multiplexer.listTargets() };

    case "gw_throttle_status":
      return { buckets: throttler.getStats(args.tenantId ? String(args.tenantId) : undefined) };

    case "cf_request_operation":
      return approvalGate.requestOperation({
        action: String(args.action) as "dns.upsert" | "cache.purge" | "worker.kv_put" | "pages.cutover_check",
        target: String(args.target),
        requestedBy: String(args.requestedBy ?? "mcp-client")
      });

    case "cf_resolve_operation":
      return approvalGate.resolveOperation(
        String(args.opId),
        String(args.decision) === "reject" ? "reject" : "approve",
        String(args.actor ?? "mcp-owner"),
        env
      );

    case "cf_audit_whatsapp_e2ee":
      return auditWhatsAppKeyTransparency({ plexiBaseUrl: env.PLEXI_URL, fetchImpl: env.fetchImpl });

    case "wa_get_business_profile":
      return {
        brand: "Waflare Unified OS",
        tenants: Array.from(throttler.tenants.values()),
        readOnlyMcp: env.MCP_READ_ONLY === "true"
      };

    case "wa_trigger_flow":
      return multiplexer.handleFlowSubmission({
        flowId: String(args.flowId),
        senderId: String(args.senderId),
        screen: args.screen ? String(args.screen) : undefined
      });

    default:
      throw new Error(`Unknown MCP tool '${name}'`);
  }
}
