import { createServer } from "node:http";
import { createWaflareApp } from "../src/index.ts";
import type { Env } from "../src/types.ts";

const PORT = Number(process.env.PORT ?? "8787");
const app = createWaflareApp();

const env: Env = {
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN ?? "waflare-verify-token",
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  VAULT_PASSPHRASE: process.env.VAULT_PASSPHRASE ?? "waflare-local-dev-passphrase",
  MCP_READ_ONLY: process.env.MCP_READ_ONLY ?? "false",
  MCP_AUTH_TOKEN: process.env.MCP_AUTH_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  ALERT_ON: process.env.ALERT_ON ?? "referrals"
};

const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);
    const reqUrl = `http://127.0.0.1:${PORT}${req.url ?? "/"}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        headers.set(k, v.join(", "));
      } else if (v !== undefined) {
        headers.set(k, v);
      }
    }

    const webReq = new Request(reqUrl, {
      method: req.method ?? "GET",
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : rawBody
    });

    const webRes = await app.fetch(webReq, env);
    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => res.setHeader(key, val));
    const buf = Buffer.from(await webRes.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Waflare local edge server listening at http://127.0.0.1:${PORT}/admin`);
  console.log(`MCP endpoint ready at http://127.0.0.1:${PORT}/mcp`);
  console.log(`Smart-Glasses HUD ready at http://127.0.0.1:${PORT}/glasses`);
});
