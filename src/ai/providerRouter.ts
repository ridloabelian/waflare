import type { Env, FetchLike } from "../types.ts";

export interface LlmCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface LlmCompletionResult {
  text: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  failoverChain: string[];
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Multi-LLM Provider Router with automatic failover (ZeroClawAndroid + Workers AI pattern).
 */
export class LLMProviderRouter {
  failures: Map<string, number>;

  constructor() {
    this.failures = new Map();
  }

  async complete(req: LlmCompletionRequest, env: Env): Promise<LlmCompletionResult> {
    const fetchFn: FetchLike = env.fetchImpl ?? fetch;
    const failoverChain: string[] = [];

    // 1. Cloudflare Workers AI binding
    if (env.AI) {
      failoverChain.push("workers-ai");
      try {
        const res = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt }
          ],
          max_tokens: req.maxTokens ?? 400
        });
        const text = String(res.response ?? "").trim();
        if (text) {
          return {
            text,
            provider: "workers-ai",
            model: "llama-3.3-70b-instruct-fp8-fast",
            promptTokens: estimateTokens(req.systemPrompt + req.userPrompt),
            completionTokens: estimateTokens(text),
            failoverChain
          };
        }
      } catch {
        this.recordFailure("workers-ai");
      }
    }

    // 2. OpenAI-compatible endpoints (OpenAI, OpenRouter, Groq)
    const openAiTargets: Array<{ name: string; url: string; key?: string; model: string }> = [
      { name: "openai", url: "https://api.openai.com/v1/chat/completions", key: env.OPENAI_API_KEY, model: "gpt-4o-mini" },
      { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: env.OPENROUTER_API_KEY, model: "google/gemini-2.5-flash" },
      { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" }
    ];

    for (const target of openAiTargets) {
      if (!target.key) continue;
      failoverChain.push(target.name);
      try {
        const resp = await fetchFn(target.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${target.key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: target.model,
            max_tokens: req.maxTokens ?? 400,
            messages: [
              { role: "system", content: req.systemPrompt },
              { role: "user", content: req.userPrompt }
            ]
          })
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            text,
            provider: target.name,
            model: target.model,
            promptTokens: json.usage?.prompt_tokens ?? estimateTokens(req.systemPrompt + req.userPrompt),
            completionTokens: json.usage?.completion_tokens ?? estimateTokens(text),
            failoverChain
          };
        }
      } catch {
        this.recordFailure(target.name);
      }
    }

    // 3. Deterministic zero-cost local edge synthesizer fallback
    failoverChain.push("edge-deterministic");
    const fallbackText = `[Waflare Edge Assistant] Received: "${req.userPrompt.slice(0, 140)}". Try /sql, /rag, /verify, /fitness, /fx, /ops, or /audit-e2ee.`;
    return {
      text: fallbackText,
      provider: "edge-deterministic",
      model: "waflare-rules-v1",
      promptTokens: estimateTokens(req.systemPrompt + req.userPrompt),
      completionTokens: estimateTokens(fallbackText),
      failoverChain
    };
  }

  private recordFailure(provider: string): void {
    this.failures.set(provider, (this.failures.get(provider) ?? 0) + 1);
  }
}
