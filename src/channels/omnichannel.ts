import type { ChannelKind, InboundEnvelope } from "../types.ts";
import { parseMetaWebhook } from "./metaWebhook.ts";

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    voice?: { file_id?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
    chat?: { id?: number };
  };
}

interface MetaMessagingUpdate {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{ type?: string; payload?: { url?: string } }>;
      };
    }>;
  }>;
}

/**
 * Normalizes WhatsApp, Telegram, Instagram, and Messenger webhooks into a single InboundEnvelope format.
 */
export function normalizeOmnichannelWebhook(
  channel: ChannelKind,
  payload: unknown,
  tenantId = "default"
): InboundEnvelope[] {
  if (channel === "whatsapp") {
    return parseMetaWebhook(payload, tenantId);
  }

  if (channel === "telegram") {
    const upd = payload as TelegramUpdate;
    const msg = upd.message;
    if (!msg) return [];
    const senderId = String(msg.from?.id ?? msg.chat?.id ?? "tg_unknown");
    const fullName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim();
    return [
      {
        messageId: `tg.${msg.message_id ?? upd.update_id ?? crypto.randomUUID()}`,
        tenantId,
        channel: "telegram",
        senderId,
        senderName: fullName || msg.from?.username || senderId,
        recipientNumber: "telegram-bot",
        kind: msg.voice ? "audio" : "text",
        text: msg.text ?? (msg.voice ? "[telegram-voice-note]" : ""),
        timestamp: msg.date ? msg.date * 1000 : Date.now(),
        raw: payload
      }
    ];
  }

  if (channel === "instagram" || channel === "messenger") {
    const upd = payload as MetaMessagingUpdate;
    const out: InboundEnvelope[] = [];
    for (const entry of upd.entry ?? []) {
      for (const item of entry.messaging ?? []) {
        const sender = item.sender?.id ?? "meta_user";
        const att = item.message?.attachments?.[0];
        const kind = att?.type === "audio" ? "audio" : att?.type === "image" ? "image" : "text";
        out.push({
          messageId: item.message?.mid ?? `${channel}.${crypto.randomUUID()}`,
          tenantId,
          channel,
          senderId: sender,
          senderName: sender,
          recipientNumber: item.recipient?.id ?? entry.id ?? channel,
          kind,
          text: item.message?.text ?? (att ? `[${att.type ?? "media"}]` : ""),
          mediaUrl: att?.payload?.url,
          timestamp: item.timestamp ?? Date.now(),
          raw: item
        });
      }
    }
    return out;
  }

  const generic = payload as { senderId?: string; senderName?: string; text?: string; messageId?: string };
  return [
    {
      messageId: generic.messageId ?? `${channel}.${crypto.randomUUID()}`,
      tenantId,
      channel,
      senderId: generic.senderId ?? "web_user",
      senderName: generic.senderName ?? "Web Visitor",
      recipientNumber: channel,
      kind: "text",
      text: generic.text ?? "",
      timestamp: Date.now(),
      raw: payload
    }
  ];
}
