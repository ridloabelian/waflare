import type { WaflareStore } from "../state/store.ts";
import type { UsageRecord } from "../types.ts";

const MODEL_PRICE_PER_1M_MICRO_USD: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-instruct-fp8-fast": { input: 120_000, output: 180_000 },
  "gpt-4o-mini": { input: 150_000, output: 600_000 },
  "google/gemini-2.5-flash": { input: 150_000, output: 600_000 },
  "llama-3.3-70b-versatile": { input: 590_000, output: 790_000 },
  "waflare-rules-v1": { input: 0, output: 0 }
};

/**
 * Pay-per-use token & micro-USD cost ledger ($0 while idle) inspired by AlwaysHungrie/salts-agent.
 */
export class UsageLedger {
  store: WaflareStore;

  constructor(store: WaflareStore) {
    this.store = store;
  }

  calculateMicroUsd(model: string, promptTokens: number, completionTokens: number): number {
    const rate = MODEL_PRICE_PER_1M_MICRO_USD[model] ?? { input: 200_000, output: 800_000 };
    const inCost = (promptTokens / 1_000_000) * rate.input;
    const outCost = (completionTokens / 1_000_000) * rate.output;
    return Math.round(inCost + outCost);
  }

  getUserSpendMicroUsd(userId: string): number {
    let total = 0;
    for (const r of this.store.usageRecords) {
      if (r.userId === userId) total += r.costMicroUsd;
    }
    return total;
  }

  canAfford(userId: string, budgetMicroUsd: number): boolean {
    if (budgetMicroUsd <= 0) return true;
    return this.getUserSpendMicroUsd(userId) < budgetMicroUsd;
  }

  record(input: {
    userId: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }, now: number = Date.now()): UsageRecord {
    const costMicroUsd = this.calculateMicroUsd(input.model, input.promptTokens, input.completionTokens);
    const rec: UsageRecord = {
      id: `use_${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      costMicroUsd,
      createdAt: now
    };
    this.store.usageRecords.push(rec);
    return rec;
  }

  summary(userId?: string): {
    totalRequests: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalMicroUsd: number;
    totalUsd: string;
  } {
    const filtered = userId
      ? this.store.usageRecords.filter((r) => r.userId === userId)
      : this.store.usageRecords;

    const totalPromptTokens = filtered.reduce((acc, r) => acc + r.promptTokens, 0);
    const totalCompletionTokens = filtered.reduce((acc, r) => acc + r.completionTokens, 0);
    const totalMicroUsd = filtered.reduce((acc, r) => acc + r.costMicroUsd, 0);

    return {
      totalRequests: filtered.length,
      totalPromptTokens,
      totalCompletionTokens,
      totalMicroUsd,
      totalUsd: (totalMicroUsd / 1_000_000).toFixed(6)
    };
  }
}
