import { createInterface } from "node:readline";
import { createWaflareApp } from "../src/index.ts";
import type { Env } from "../src/types.ts";

const app = createWaflareApp();

// Omit MCP_AUTH_TOKEN in local stdio mode so standard MCP clients are not rejected with 401.
const env: Env = {
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN ?? "waflare-verify-token",
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  VAULT_PASSPHRASE: process.env.VAULT_PASSPHRASE ?? "waflare-local-dev-passphrase",
  MCP_READ_ONLY: process.env.MCP_READ_ONLY ?? "false",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  ALERT_ON: process.env.ALERT_ON ?? "referrals"
};

/**
 * Process newline-delimited JSON-RPC 2.0 MCP requests over stdin/stdout without polluting stdout.
 */
async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const res = await app.fetch(
        new Request("http://127.0.0.1/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: line
        }),
        env
      );

      if (res.status === 202 || res.status === 204) {
        continue;
      }

      const text = await res.text();
      if (text) {
        process.stdout.write(`${text}\n`);
      }
    } catch (err) {
      process.stderr.write(
        `[waflare-mcp-stdio] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
      );
    }
  }
}

main().catch((err) => {
  process.stderr.write(
    `[waflare-mcp-stdio] Fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});
