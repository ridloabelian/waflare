import test from "node:test";
import assert from "node:assert/strict";

import { WaflareStore } from "../src/state/store.ts";
import { CrmInboxEngine, TWENTY_FOUR_HOURS_MS } from "../src/crm/inbox.ts";
import { parseMetaWebhook } from "../src/channels/metaWebhook.ts";
import { validateReadOnlySql, executeDualSqlQuery, HybridRagIndex } from "../src/retrieval/dualRetrieval.ts";
import { assessSalesLead } from "../src/skills/salesAgent.ts";
import { parseAndLogFitnessMessage } from "../src/skills/fitnessLogger.ts";
import { verifyClaim } from "../src/skills/factChecker.ts";
import { convertCurrencyCommand } from "../src/skills/currencySkill.ts";

test("CRM enforces 24h Meta reply window, CTWA ad attribution, STOP opt-out, and broadcast exclusion", () => {
  const now = 1_700_000_000_000;
  const store = new WaflareStore(now);
  const crm = new CrmInboxEngine(store);

  // Existing seeded contact lead_6289876543210 had lastInboundAt = now - 30h -> expired
  const expiredContact = store.contacts.get("lead_6289876543210");
  assert.ok(expiredContact);
  const expiredCheck = crm.canSendFreeformMessage(expiredContact, now);
  assert.equal(expiredCheck.allowed, false);
  assert.equal(expiredCheck.window.requiresHsmTemplate, true);

  // Inbound CTWA ad click opens fresh 24h window + stores referral + runs pricing rule
  const [adEnvelope] = parseMetaWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "628555000111", profile: { name: "Dina Putri" } }],
              messages: [
                {
                  id: "wamid.ctwa.1",
                  from: "628555000111",
                  timestamp: String(Math.floor(now / 1000)),
                  type: "text",
                  text: { body: "Halo mau tanya harga paket enterprise" },
                  referral: {
                    source_id: "ad_ig_99",
                    source_type: "ad",
                    headline: "WhatsApp CRM on Cloudflare",
                    source_url: "https://fb.me/ad99"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  });

  const upsert = crm.upsertContactFromInbound(adEnvelope);
  assert.equal(upsert.contact.ctwaReferral?.sourceId, "ad_ig_99");
  assert.ok(upsert.contact.tags.includes("ctwa-ad"));
  assert.ok(upsert.contact.tags.includes("pricing-asked"));
  assert.equal(upsert.automationsTriggered.length, 2); // 1 live, 1 shadow
  assert.equal(upsert.automationsTriggered.find((a) => a.mode === "shadow")?.sideEffectsApplied, false);

  const openCheck = crm.canSendFreeformMessage(upsert.contact, now + TWENTY_FOUR_HOURS_MS - 1000);
  assert.equal(openCheck.allowed, true);

  // Send STOP opt-out and verify broadcast plan skips this contact
  const stopResult = crm.upsertContactFromInbound({
    ...adEnvelope,
    messageId: "wamid.stop.1",
    text: "STOP",
    timestamp: now + 5000
  });
  assert.equal(stopResult.optedOutTriggered, true);
  assert.equal(stopResult.contact.optedOut, true);

  const broadcast = crm.planPacedBroadcast("reopen_support_window");
  assert.equal(broadcast.skippedOptedOut, 1);
  assert.equal(broadcast.recipients.some((r) => r.phone === "628555000111"), false);
});

test("Dual /sql guardrail blocks mutations and /rag retrieves relevant items via BM25 + cosine", async () => {
  const store = new WaflareStore();

  assert.equal(validateReadOnlySql("DROP TABLE contacts").valid, false);
  assert.equal(validateReadOnlySql("SELECT * FROM catalog; DELETE FROM contacts").valid, false);
  assert.equal(validateReadOnlySql("SELECT sku, title FROM catalog").valid, true);

  const blocked = await executeDualSqlQuery("DELETE FROM catalog", store.catalog);
  assert.equal(blocked.valid, false);

  const books = await executeDualSqlQuery(
    "SELECT sku, title, category, price_usd, rating FROM catalog WHERE category = 'book' ORDER BY rating DESC",
    store.catalog
  );
  assert.equal(books.valid, true);
  assert.equal(books.rows.length, 2);

  const rag = new HybridRagIndex(store.catalog);
  const hits = rag.search("whisper voice transcription smart glasses", 2);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].item.sku, "WF-VOICE-KIT");
});

test("Vertical skills: sales lead scoring, fitness logger, fact-checker, and /fx currency converter", () => {
  const store = new WaflareStore();
  const contact = store.contacts.get("lead_6281234567890")!;

  const sales = assessSalesLead(
    contact,
    "Tim enterprise kami butuh harga demo sekarang dan ingin bicara dengan sales",
    store.messages,
    store.catalog
  );
  assert.ok(sales.score >= 80);
  assert.equal(sales.tier, "hot");
  assert.equal(sales.needsHumanHandoff, true);

  const runLog = parseAndLogFitnessMessage(store, contact.phone, "/fitness Lari 7.5km dalam 42 menit");
  assert.equal(runLog.entry?.entryType, "run");
  assert.equal(runLog.entry?.distanceKm, 7.5);
  assert.equal(runLog.entry?.durationMin, 42);

  const mealLog = parseAndLogFitnessMessage(store, contact.phone, "/fitness makan ayam 480 kcal 38g protein");
  assert.equal(mealLog.entry?.entryType, "meal");
  assert.equal(mealLog.entry?.calories, 480);
  assert.equal(mealLog.entry?.proteinGrams, 38);

  const verifiedTrue = verifyClaim(store, "/verify Cloudflare operates Plexi for WhatsApp key transparency");
  assert.equal(verifiedTrue.verdict, "true");
  assert.ok(verifiedTrue.sources.length >= 1);

  const unverified = verifyClaim(store, "/verify random unverified rumor xyz123");
  assert.equal(unverified.verdict, "unverified");

  const fx = convertCurrencyCommand("/fx 10 USD IDR");
  assert.equal(fx.ok, true);
  assert.equal(fx.converted, 158500);
});
