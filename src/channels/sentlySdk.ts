import type { Env, FetchLike, OutboundMessage, SentlyChannel } from "../types.ts";
import { sendMetaCloudMessage } from "./metaWebhook.ts";

export interface DispatchReceipt {
  id: string;
  channel: SentlyChannel;
  delivered: boolean;
  mode: string;
  attemptedFallback?: SentlyChannel;
  detail: unknown;
  timestamp: number;
}

/**
 * Zero-dependency omnichannel outbound dispatcher inspired by sently,
 * supporting WhatsApp, Telegram, Email (Resend), SMS (Twilio), ntfy, Discord, and Webhooks.
 */
export class SentlyDispatcher {
  receipts: DispatchReceipt[];

  constructor() {
    this.receipts = [];
  }

  async send(
    message: OutboundMessage,
    env: Env,
    fallbackChannels: SentlyChannel[] = []
  ): Promise<DispatchReceipt> {
    const primary = await this.dispatchOnce(message, env);
    if (primary.delivered || fallbackChannels.length === 0) {
      this.receipts.push(primary);
      return primary;
    }

    for (const fbChannel of fallbackChannels) {
      const attempt = await this.dispatchOnce({ ...message, channel: fbChannel }, env, true);
      if (attempt.delivered) {
        const finalReceipt: DispatchReceipt = {
          ...attempt,
          attemptedFallback: fbChannel
        };
        this.receipts.push(finalReceipt);
        return finalReceipt;
      }
    }

    this.receipts.push(primary);
    return primary;
  }

  private async dispatchOnce(
    message: OutboundMessage,
    env: Env,
    isFallback = false
  ): Promise<DispatchReceipt> {
    const fetchFn: FetchLike = env.fetchImpl ?? fetch;
    const now = Date.now();

    if (message.channel === "whatsapp") {
      const res = await sendMetaCloudMessage(message, {
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        fetchImpl: fetchFn
      });
      return {
        id: message.id,
        channel: "whatsapp",
        delivered: res.delivered,
        mode: res.mode,
        detail: res.responseBody,
        timestamp: now
      };
    }

    if (message.channel === "telegram") {
      if (!env.TELEGRAM_BOT_TOKEN) {
        return { id: message.id, channel: "telegram", delivered: true, mode: "dry_run", detail: { mocked: true, to: message.to }, timestamp: now };
      }
      const resp = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: message.to, text: message.text })
      });
      return { id: message.id, channel: "telegram", delivered: resp.ok, mode: "telegram_live", detail: await resp.json().catch(() => ({})), timestamp: now };
    }

    if (message.channel === "discord") {
      const targetUrl = !isFallback && message.to.startsWith("http") ? message.to : env.DISCORD_WEBHOOK_URL;
      if (!targetUrl) {
        return { id: message.id, channel: "discord", delivered: true, mode: "dry_run", detail: { mocked: true }, timestamp: now };
      }
      const resp = await fetchFn(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.text })
      });
      return { id: message.id, channel: "discord", delivered: resp.ok, mode: "discord_live", detail: { status: resp.status }, timestamp: now };
    }

    if (message.channel === "ntfy") {
      const topicUrl = !isFallback && message.to.startsWith("http") ? message.to : env.NTFY_TOPIC_URL;
      if (!topicUrl) {
        return { id: message.id, channel: "ntfy", delivered: true, mode: "dry_run", detail: { mocked: true }, timestamp: now };
      }
      const resp = await fetchFn(topicUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: message.text
      });
      return { id: message.id, channel: "ntfy", delivered: resp.ok, mode: "ntfy_live", detail: { status: resp.status }, timestamp: now };
    }

    if (message.channel === "email") {
      if (!env.RESEND_API_KEY) {
        return { id: message.id, channel: "email", delivered: true, mode: "dry_run", detail: { mocked: true, to: message.to }, timestamp: now };
      }
      const resp = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "waflare@alerts.local",
          to: [message.to],
          subject: "Waflare Notification",
          text: message.text
        })
      });
      return { id: message.id, channel: "email", delivered: resp.ok, mode: "resend_live", detail: await resp.json().catch(() => ({})), timestamp: now };
    }

    if (message.channel === "sms") {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_NUMBER) {
        return { id: message.id, channel: "sms", delivered: true, mode: "dry_run", detail: { mocked: true, to: message.to }, timestamp: now };
      }
      const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
      const form = new URLSearchParams({
        To: message.to,
        From: env.TWILIO_WHATSAPP_NUMBER.replace(/^whatsapp:/, ""),
        Body: message.text
      });
      const resp = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: form.toString()
        }
      );
      return { id: message.id, channel: "sms", delivered: resp.ok, mode: "twilio_sms", detail: await resp.json().catch(() => ({})), timestamp: now };
    }

    // Generic webhook
    if (!message.to.startsWith("http")) {
      return { id: message.id, channel: "webhook", delivered: true, mode: "dry_run", detail: { mocked: true, target: message.to }, timestamp: now };
    }
    const resp = await fetchFn(message.to, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    return { id: message.id, channel: "webhook", delivered: resp.ok, mode: "webhook_live", detail: { status: resp.status }, timestamp: now };
  }
}
