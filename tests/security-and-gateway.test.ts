import test from "node:test";
import assert from "node:assert/strict";

import { encryptVaultPayload, decryptVaultPayload } from "../src/security/vault.ts";
import { auditWhatsAppKeyTransparency, parsePlexiRoot } from "../src/security/plexiAuditor.ts";
import { handleMetaVerifyChallenge, signMetaPayload, verifyMetaSignature, parseMetaWebhook } from "../src/channels/metaWebhook.ts";
import { signTwilioWebhook, verifyTwilioSignature, parseTwilioFormWebhook } from "../src/channels/twilioAdapter.ts";
import { AntiBanThrottler } from "../src/gateway/throttler.ts";
import { WebhookMultiplexer } from "../src/gateway/multiplexer.ts";
import { WaflareStore } from "../src/state/store.ts";
import { SentlyDispatcher } from "../src/channels/sentlySdk.ts";

test("Vault encrypts and decrypts message payload via AES-256-GCM and rejects wrong passphrase", async () => {
  const secret = "super-strong-passphrase-2026";
  const plaintext = "Sensitive WhatsApp message history entry";
  const sealed = await encryptVaultPayload(plaintext, secret);
  assert.ok(sealed.includes("AES-256-GCM"));

  const decrypted = await decryptVaultPayload(sealed, secret);
  assert.equal(decrypted, plaintext);

  await assert.rejects(() => decryptVaultPayload(sealed, "wrong-passphrase-2026"));
});

test("Meta Cloud API webhook challenge & HMAC-SHA256 signature verification", async () => {
  const okChallenge = handleMetaVerifyChallenge(
    new URL("https://waflare.workers.dev/webhook?hub.mode=subscribe&hub.verify_token=my-tok&hub.challenge=99182"),
    "my-tok"
  );
  assert.equal(okChallenge.status, 200);
  assert.equal(await okChallenge.text(), "99182");

  const badChallenge = handleMetaVerifyChallenge(
    new URL("https://waflare.workers.dev/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=99182"),
    "my-tok"
  );
  assert.equal(badChallenge.status, 403);

  const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const sig = await signMetaPayload(rawBody, "meta-app-secret");
  assert.equal(await verifyMetaSignature(rawBody, sig, "meta-app-secret"), true);
  assert.equal(await verifyMetaSignature(rawBody + " ", sig, "meta-app-secret"), false);
});

test("Twilio X-Twilio-Signature HMAC-SHA1 verification and form webhook parser", async () => {
  const url = "https://waflare.workers.dev/webhook/twilio";
  const params = {
    MessageSid: "SM12345",
    From: "whatsapp:+628111222333",
    To: "whatsapp:+14155238886",
    ProfileName: "Ridlo",
    Body: "Check audio",
    NumMedia: "1",
    MediaContentType0: "audio/ogg",
    MediaUrl0: "https://api.twilio.com/media/abc.ogg"
  };
  const sig = await signTwilioWebhook(url, params, "twilio-secret-token");
  assert.equal(await verifyTwilioSignature(url, params, sig, "twilio-secret-token"), true);
  assert.equal(await verifyTwilioSignature(url, params, "tampered", "twilio-secret-token"), false);

  const envelope = parseTwilioFormWebhook(params);
  assert.equal(envelope.channel, "twilio_whatsapp");
  assert.equal(envelope.kind, "audio");
  assert.equal(envelope.senderId, "628111222333");
});

test("Anti-ban throttler enforces token bucket capacity and estimates typing jitter", () => {
  const throttler = new AntiBanThrottler(2, 0.5);
  const t0 = 1_700_000_000_000;

  const d1 = throttler.consume("default", "628111", "Hello there!", t0);
  const d2 = throttler.consume("default", "628111", "Second message", t0 + 100);
  const d3 = throttler.consume("default", "628111", "Too fast burst", t0 + 200);

  assert.equal(d1.allowed, true);
  assert.ok(d1.typingDelayMs >= 350);
  assert.equal(d2.allowed, true);
  assert.equal(d3.allowed, false);
  assert.ok(d3.retryAfterMs > 0);

  // After 3 seconds (refill 1.5 tokens) it should allow again
  const d4 = throttler.consume("default", "628111", "Recovered", t0 + 3_200);
  assert.equal(d4.allowed, true);
});

test("Webhook multiplexer deduplicates message IDs and signs fan-out requests", async () => {
  const store = new WaflareStore();
  const mux = new WebhookMultiplexer(store);
  mux.registerTarget({ url: "https://downstream.example/hook", secret: "hook-secret", events: ["whatsapp.inbound"] });

  const deliveredPayloads: Array<{ sig: string | null; body: string }> = [];
  const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const hdrs = new Headers(init?.headers);
    deliveredPayloads.push({
      sig: hdrs.get("x-waflare-signature-256"),
      body: String(init?.body ?? "")
    });
    return new Response("ok", { status: 200 });
  };

  const [env] = parseMetaWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: "wamid.dup.1", from: "628123", type: "text", text: { body: "Hi" } }]
            }
          }
        ]
      }
    ]
  });

  const first = await mux.fanOut("whatsapp.inbound", env, mockFetch);
  assert.equal(first.deduplicated, false);
  assert.equal(first.targetsAttempted, 1);
  assert.equal(deliveredPayloads.length, 1);
  assert.ok(deliveredPayloads[0].sig?.startsWith("sha256="));

  const second = await mux.fanOut("whatsapp.inbound", env, mockFetch);
  assert.equal(second.deduplicated, true);
  assert.equal(deliveredPayloads.length, 1);
});

test("Sently dispatcher supports fallback chain when primary channel fails", async () => {
  const dispatcher = new SentlyDispatcher();
  const mockFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("primary-down")) {
      return new Response("down", { status: 503 });
    }
    return new Response("accepted", { status: 200 });
  };

  const receipt = await dispatcher.send(
    {
      id: "sently_1",
      to: "https://primary-down.example/hook",
      channel: "webhook",
      kind: "text",
      text: "Alert message"
    },
    { fetchImpl: mockFetch, NTFY_TOPIC_URL: "https://ntfy.example/waflare" },
    ["ntfy"]
  );

  assert.equal(receipt.delivered, true);
  assert.equal(receipt.channel, "ntfy");
  assert.equal(receipt.attemptedFallback, "ntfy");
});

test("Cloudflare Plexi Key Transparency auditor parses root hash & handles offline fallback", async () => {
  const parsed = parsePlexiRoot("458298/3ae9497069cc722dc9e00f8251da87071646a57dae2fc7882f1d8214961d80bd");
  assert.equal(parsed.validFormat, true);
  assert.equal(parsed.epoch, 458298);

  const mockPlexiFetch = async () =>
    Response.json({
      name: "whatsapp.key-transparency.v1",
      status: "Online",
      root: "460000/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      last_verified_epoch: 2030000,
      log_directory: "https://d1tfr3x7n136ak.cloudfront.net",
      signature_version: 1,
      ciphersuite: 1
    });

  const liveAudit = await auditWhatsAppKeyTransparency({ fetchImpl: mockPlexiFetch });
  assert.equal(liveAudit.sourceMode, "live_plexi");
  assert.equal(liveAudit.validFormat, true);
  assert.equal(liveAudit.epoch, 460000);

  const failingFetch = async () => {
    throw new Error("Network offline");
  };
  const fallbackAudit = await auditWhatsAppKeyTransparency({ fetchImpl: failingFetch, allowFallback: true });
  assert.equal(fallbackAudit.sourceMode, "snapshot_fallback");
  assert.equal(fallbackAudit.validFormat, true);
  assert.ok(fallbackAudit.warnings.length >= 1);
});
