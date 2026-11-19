import type { CtwaReferral, FetchLike, InboundEnvelope, OutboundMessage } from "../types.ts";

const encoder = new TextEncoder();

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signMetaPayload(rawBody: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/**
 * Verifies Meta's X-Hub-Signature-256 webhook header using Web Crypto HMAC-SHA256.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const expected = await signMetaPayload(rawBody, appSecret);
  return constantTimeEqual(expected.toLowerCase(), signatureHeader.trim().toLowerCase());
}

/**
 * Handles Meta WhatsApp Cloud API GET /webhook challenge handshake.
 */
export function handleMetaVerifyChallenge(url: URL, expectedVerifyToken: string): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === expectedVerifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden: invalid verify token", { status: 403 });
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string };
          image?: { id?: string; caption?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
          button?: { payload?: string; text?: string };
          referral?: {
            source_id?: string;
            source_type?: string;
            headline?: string;
            body?: string;
            source_url?: string;
            ctwa_clid?: string;
          };
        }>;
      };
    }>;
  }>;
}

/**
 * Extracts normalized InboundEnvelopes (including CTWA referrals, audio, and button replies) from a Meta Cloud API webhook payload.
 */
export function parseMetaWebhook(payload: unknown, tenantId = "default"): InboundEnvelope[] {
  const body = payload as MetaWebhookPayload;
  const envelopes: InboundEnvelope[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      const recipientNumber =
        value.metadata?.display_phone_number ??
        value.metadata?.phone_number_id ??
        "unknown";

      const contactMap = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id) {
          contactMap.set(c.wa_id, c.profile?.name ?? c.wa_id);
        }
      }

      for (const msg of value.messages) {
        const sender = msg.from ?? "unknown";
        const senderName = contactMap.get(sender) ?? sender;
        const tsSeconds = msg.timestamp ? Number(msg.timestamp) : Math.floor(Date.now() / 1000);
        const timestamp = Number.isFinite(tsSeconds) ? tsSeconds * 1000 : Date.now();

        let kind: InboundEnvelope["kind"] = "text";
        let text = msg.text?.body ?? "";
        let interactiveReplyId: string | undefined;

        if (msg.type === "audio" || msg.audio) {
          kind = "audio";
          text = text || `[voice-note:${msg.audio?.id ?? "audio"}]`;
        } else if (msg.type === "image" || msg.image) {
          kind = "image";
          text = msg.image?.caption ?? "[image]";
        } else if (msg.type === "interactive" && msg.interactive) {
          kind = "interactive";
          const br = msg.interactive.button_reply;
          const lr = msg.interactive.list_reply;
          interactiveReplyId = br?.id ?? lr?.id;
          text = br?.title ?? lr?.title ?? interactiveReplyId ?? "";
        } else if (msg.type === "button" && msg.button) {
          kind = "interactive";
          interactiveReplyId = msg.button.payload;
          text = msg.button.text ?? msg.button.payload ?? "";
        }

        let referral: CtwaReferral | undefined;
        if (msg.referral?.source_id) {
          referral = {
            sourceId: msg.referral.source_id,
            sourceType: msg.referral.source_type,
            headline: msg.referral.headline,
            body: msg.referral.body,
            sourceUrl: msg.referral.source_url,
            ctwaClid: msg.referral.ctwa_clid
          };
        }

        envelopes.push({
          messageId: msg.id ?? `wamid.${crypto.randomUUID()}`,
          tenantId,
          channel: "whatsapp",
          senderId: sender,
          senderName,
          recipientNumber,
          kind,
          text,
          interactiveReplyId,
          referral,
          timestamp,
          raw: msg
        });
      }
    }
  }

  return envelopes;
}

export async function sendMetaCloudMessage(
  message: OutboundMessage,
  options: {
    accessToken?: string;
    phoneNumberId?: string;
    fetchImpl?: FetchLike;
  }
): Promise<{ delivered: boolean; mode: "meta_live" | "dry_run"; statusCode?: number; responseBody?: unknown }> {
  if (!options.accessToken || !options.phoneNumberId) {
    return {
      delivered: true,
      mode: "dry_run",
      responseBody: { mocked: true, to: message.to, kind: message.kind, text: message.text }
    };
  }

  const graphBody: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: message.to
  };

  if (message.kind === "template" && message.templateName) {
    graphBody.type = "template";
    graphBody.template = {
      name: message.templateName,
      language: { code: "en_US" }
    };
  } else if (message.kind === "interactive_buttons" && message.buttons?.length) {
    graphBody.type = "interactive";
    graphBody.interactive = {
      type: "button",
      body: { text: message.text },
      action: {
        buttons: message.buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) }
        }))
      }
    };
  } else {
    graphBody.type = "text";
    graphBody.text = { body: message.text };
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const resp = await fetchFn(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(options.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(graphBody)
    }
  );

  const responseBody = await resp.json().catch(() => ({}));
  return {
    delivered: resp.ok,
    mode: "meta_live",
    statusCode: resp.status,
    responseBody
  };
}
