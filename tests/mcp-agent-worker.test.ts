import test from "node:test";
import assert from "node:assert/strict";

import { createWaflareApp } from "../src/index.ts";
import { signMetaPayload } from "../src/channels/metaWebhook.ts";
import { ConversationSessionDO } from "../src/durable/sessionDO.ts";

test("Worker health, UI HTML endpoints, and all 27 curated GitHub projects are exposed", async () => {
  const app = createWaflareApp();

  const healthRes = await app.fetch(new Request("https://waflare.workers.dev/health"));
  assert.equal(healthRes.status, 200);
  const health = (await healthRes.json()) as { ok: boolean; curatedProjects: number };
  assert.equal(health.ok, true);
  assert.equal(health.curatedProjects, 27);

  const curationRes = await app.fetch(new Request("https://waflare.workers.dev/api/curation"));
  const curation = (await curationRes.json()) as { total: number; projects: Array<{ fullName: string }> };
  assert.equal(curation.total, 27);
  assert.equal(curation.projects[0].fullName, "finereli/whatsapp-mcp");
  assert.ok(curation.projects.some((p) => p.fullName === "cloudflare/plexi"));
  assert.ok(curation.projects.some((p) => p.fullName === "the-dream-machine/chatbot-whatsapp-workers"));

  const adminRes = await app.fetch(new Request("https://waflare.workers.dev/admin"));
  assert.equal(adminRes.status, 200);
  const adminHtml = await adminRes.text();
  assert.ok(adminHtml.includes("Waflare Command Center"));

  const glassesRes = await app.fetch(new Request("https://waflare.workers.dev/glasses"));
  assert.equal(glassesRes.status, 200);
  const glassesHtml = await glassesRes.text();
  assert.ok(glassesHtml.includes("WAFLARE // GLASSES HUD"));
});

test("MCP Streamable HTTP server lists all 28 tools and enforces finereli MCP_READ_ONLY lock", async () => {
  const app = createWaflareApp();

  const initRes = await app.fetch(
    new Request("https://waflare.workers.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })
    })
  );
  assert.equal(initRes.status, 200);
  const initJson = (await initRes.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(initJson.result.serverInfo.name, "waflare-mcp");

  const listRes = await app.fetch(
    new Request("https://waflare.workers.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    })
  );
  const listJson = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
  assert.equal(listJson.result.tools.length, 28);

  // Read-only mode blocks wa_send_text while permitting wa_search_messages
  const blockedSend = await app.fetch(
    new Request("https://waflare.workers.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "wa_send_text", arguments: { to: "6281234567890", text: "Hi" } }
      })
    }),
    { MCP_READ_ONLY: "true" }
  );
  assert.equal(blockedSend.status, 403);

  const allowedSearch = await app.fetch(
    new Request("https://waflare.workers.dev/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "wa_search_messages", arguments: { query: "Cloudflare" } }
      })
    }),
    { MCP_READ_ONLY: "true" }
  );
  assert.equal(allowedSearch.status, 200);
  const searchJson = (await allowedSearch.json()) as { result: { structuredContent: { results: unknown[] } } };
  assert.ok(searchJson.result.structuredContent.results.length >= 1);
});

test("End-to-end WhatsApp webhook + approval-gated Cloudflare Ops + AI traffic radar + DO isolation", async () => {
  const app = createWaflareApp();
  const appSecret = "test-meta-secret";

  // 1. Trigger /ops via signed Meta webhook -> creates pending operation with buttons
  const payload1 = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "6281234567890", profile: { name: "Ridlo" } }],
              messages: [
                {
                  id: "wamid.ops.1",
                  from: "6281234567890",
                  timestamp: "1732000000",
                  type: "text",
                  text: { body: "/ops cache.purge https://ridlo.id/*" }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  const sig1 = await signMetaPayload(payload1, appSecret);
  const res1 = await app.fetch(
    new Request("https://waflare.workers.dev/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": sig1 },
      body: payload1
    }),
    { WHATSAPP_APP_SECRET: appSecret }
  );
  assert.equal(res1.status, 200);

  const opsListRes = await app.fetch(new Request("https://waflare.workers.dev/api/ops/list"));
  const opsList = (await opsListRes.json()) as { operations: Array<{ id: string; status: string }> };
  assert.equal(opsList.operations.length, 1);
  assert.equal(opsList.operations[0].status, "pending");

  // 2. Owner taps WhatsApp interactive button ops_approve:<id>
  const opId = opsList.operations[0].id;
  const payload2 = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.ops.2",
                  from: "6281234567890",
                  timestamp: "1732000010",
                  type: "interactive",
                  interactive: { button_reply: { id: `ops_approve:${opId}`, title: "Approve" } }
                }
              ]
            }
          }
        ]
      }
    ]
  });
  const sig2 = await signMetaPayload(payload2, appSecret);
  const res2 = await app.fetch(
    new Request("https://waflare.workers.dev/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": sig2 },
      body: payload2
    }),
    { WHATSAPP_APP_SECRET: appSecret }
  );
  assert.equal(res2.status, 200);

  const opsAfter = (await (await app.fetch(new Request("https://waflare.workers.dev/api/ops/list"))).json()) as {
    operations: Array<{ id: string; status: string }>;
  };
  assert.equal(opsAfter.operations[0].status, "executed");

  // 3. AI Traffic Radar detects ChatGPT referral & GPTBot crawler
  const trafficRes = await app.fetch(
    new Request("https://waflare.workers.dev/api/traffic/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/pricing", referer: "https://chatgpt.com/", alertMode: "referrals" })
    })
  );
  const trafficJson = (await trafficRes.json()) as { detected: boolean; alerted: boolean; event: { kind: string; source: string } };
  assert.equal(trafficJson.detected, true);
  assert.equal(trafficJson.alerted, true);
  assert.equal(trafficJson.event.kind, "ai_referral");
  assert.equal(trafficJson.event.source, "ChatGPT");

  // 4. Durable Object standalone session isolation & pairing
  const doInstance = new ConversationSessionDO();
  const pairRes = await doInstance.fetch(new Request("https://do/pair?account=main", { method: "POST" }));
  const pairJson = (await pairRes.json()) as { ok: boolean; snapshot: { paired: boolean; qrPairingToken: string } };
  assert.equal(pairJson.ok, true);
  assert.equal(pairJson.snapshot.paired, true);
  assert.ok(pairJson.snapshot.qrPairingToken.startsWith("qr_"));
});

test("Voice STT, omnichannel adapters, OpenAI chat completions, companion bridge, and LLM failover/usage cap", async () => {
  const app = createWaflareApp();

  // 1. Omnichannel Telegram webhook
  const tgRes = await app.fetch(
    new Request("https://waflare.workers.dev/webhook/omnichannel/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_id: 99,
        message: {
          message_id: 42,
          date: 1732000100,
          text: "/fx 50 USD IDR",
          from: { id: 777111, first_name: "Bima", username: "bima" },
          chat: { id: 777111 }
        }
      })
    })
  );
  const tgJson = (await tgRes.json()) as { ok: boolean; results: Array<{ agentUsed: string; reply: string }> };
  assert.equal(tgJson.ok, true);
  assert.equal(tgJson.results[0].agentUsed, "CurrencyAgent");
  assert.ok(tgJson.results[0].reply.includes("792,500 IDR"));

  // 2. Voice note simulation
  const voiceRes = await app.fetch(
    new Request("https://waflare.workers.dev/api/agent/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: "6281234567890",
        kind: "audio",
        text: "/verify Cloudflare operates Plexi for WhatsApp key transparency"
      })
    })
  );
  const voiceJson = (await voiceRes.json()) as { ok: boolean; reply: string; metadata: { voiceTranscript: string } };
  assert.equal(voiceJson.ok, true);
  assert.ok(voiceJson.reply.includes("[Voice Transcript]"));
  assert.ok(voiceJson.reply.includes("[TRUE"));

  // 3. Companion Cloudflare Tunnel bridge heartbeat + enqueue + drain
  await app.fetch(
    new Request("https://waflare.workers.dev/api/companion/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "pixel-9-pro",
        platform: "android",
        tunnelUrl: "https://pixel9.trycloudflare.com"
      })
    })
  );
  await app.fetch(
    new Request("https://waflare.workers.dev/api/companion/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "pixel-9-pro", to: "628111", text: "Queued via tunnel" })
    })
  );
  const drainRes = await app.fetch(
    new Request("https://waflare.workers.dev/api/companion/drain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "pixel-9-pro" })
    })
  );
  const drainJson = (await drainRes.json()) as { jobs: Array<{ text: string }> };
  assert.equal(drainJson.jobs.length, 1);
  assert.equal(drainJson.jobs[0].text, "Queued via tunnel");

  // 4. LLM failover chain + OpenAI-compatible /v1/chat/completions
  const mockFailoverFetch = async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("api.openai.com")) {
      return new Response("upstream error", { status: 500 });
    }
    return Response.json({
      choices: [{ message: { content: "Recovered via OpenRouter failover" } }],
      usage: { prompt_tokens: 120, completion_tokens: 45 }
    });
  };
  const chatRes = await app.fetch(
    new Request("https://waflare.workers.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello failover" }] })
    }),
    { OPENAI_API_KEY: "sk-bad", OPENROUTER_API_KEY: "or-good", fetchImpl: mockFailoverFetch }
  );
  const chatJson = (await chatRes.json()) as { choices: Array<{ message: { content: string } }> };
  assert.equal(chatJson.choices[0].message.content, "Recovered via OpenRouter failover");

  // 5. Usage ledger cap triggers when USER_BUDGET_MICRO_USD is tiny and user has prior paid usage
  await app.fetch(
    new Request("https://waflare.workers.dev/api/agent/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: "628999888777", text: "Explain Cloudflare edge routing" })
    }),
    { OPENAI_API_KEY: "sk-ok", OPENROUTER_API_KEY: "or-ok", fetchImpl: mockFailoverFetch }
  );
  const cappedRes = await app.fetch(
    new Request("https://waflare.workers.dev/api/agent/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: "628999888777", text: "One more query" })
    }),
    { USER_BUDGET_MICRO_USD: "1" }
  );
  const cappedJson = (await cappedRes.json()) as { agentUsed: string };
  assert.equal(cappedJson.agentUsed, "UsageLedgerGuard");
});

