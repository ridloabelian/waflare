import type { InboundEnvelope } from "../types.ts";
import { constantTimeEqual } from "./metaWebhook.ts";

const encoder = new TextEncoder();

export function buildTwilioSignatureBase(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  let base = url;
  for (const k of keys) {
    base += k + (params[k] ?? "");
  }
  return base;
}

export async function signTwilioWebhook(
  url: string,
  params: Record<string, string>,
  authToken: string
): Promise<string> {
  const base = buildTwilioSignatureBase(url, params);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(base));
  let bin = "";
  for (const b of new Uint8Array(sig)) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

/**
 * Validates Twilio's X-Twilio-Signature header using Web Crypto HMAC-SHA1.
 */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null,
  authToken: string
): Promise<boolean> {
  if (!signatureHeader || !authToken) return false;
  const expected = await signTwilioWebhook(url, params, authToken);
  return constantTimeEqual(expected, signatureHeader.trim());
}

export function parseFormUrlEncoded(rawBody: string): Record<string, string> {
  const search = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [k, v] of search.entries()) {
    out[k] = v;
  }
  return out;
}

export function parseTwilioFormWebhook(params: Record<string, string>, tenantId = "default"): InboundEnvelope {
  const rawFrom = (params.From ?? "").replace(/^whatsapp:\+?/, "");
  const rawTo = (params.To ?? "").replace(/^whatsapp:\+?/, "");
  const numMedia = Number(params.NumMedia ?? "0");
  const mediaType = params.MediaContentType0 ?? "";
  const isAudio = numMedia > 0 && mediaType.startsWith("audio/");

  return {
    messageId: params.MessageSid ?? `twilio.${crypto.randomUUID()}`,
    tenantId,
    channel: "twilio_whatsapp",
    senderId: rawFrom || "unknown",
    senderName: params.ProfileName ?? (rawFrom || "Twilio User"),
    recipientNumber: rawTo || "twilio",
    kind: isAudio ? "audio" : "text",
    text: params.Body ?? (isAudio ? "[twilio-voice-note]" : ""),
    mediaUrl: params.MediaUrl0,
    timestamp: Date.now(),
    raw: params
  };
}

export function buildTwimlMessageResponse(replyText: string, mediaUrl?: string): Response {
  const escapedText = replyText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const mediaTag = mediaUrl
    ? `<Media>${mediaUrl.replaceAll("&", "&amp;")}</Media>`
    : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${escapedText}</Body>${mediaTag}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8" }
  });
}
