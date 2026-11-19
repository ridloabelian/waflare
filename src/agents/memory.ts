import type { WaflareStore } from "../state/store.ts";
import type { UserMemoryState } from "../types.ts";

/**
 * 3-layer per-user memory engine inspired by ClopinetteAI:
 * 1. User Profile (key-value preferences)
 * 2. Working History (recent conversation turns)
 * 3. Episodic Facts (keyword-searchable durable facts)
 */
export class MemoryManager {
  store: WaflareStore;
  maxWorkingHistory: number;

  constructor(store: WaflareStore, maxWorkingHistory = 20) {
    this.store = store;
    this.maxWorkingHistory = maxWorkingHistory;
  }

  getOrCreate(userId: string): UserMemoryState {
    const existing = this.store.memories.get(userId);
    if (existing) return existing;
    const state: UserMemoryState = {
      userId,
      profile: {},
      workingHistory: [],
      episodicFacts: []
    };
    this.store.memories.set(userId, state);
    return state;
  }

  appendTurn(userId: string, role: "user" | "assistant", text: string, now: number = Date.now()): void {
    const state = this.getOrCreate(userId);
    state.workingHistory.push({ role, text, timestamp: now });
    if (state.workingHistory.length > this.maxWorkingHistory) {
      state.workingHistory = state.workingHistory.slice(-this.maxWorkingHistory);
    }

    if (role === "user") {
      const nameMatch = /(?:my name is|nama saya)\s+([A-Za-z][A-Za-z0-9\s]{1,30})/i.exec(text);
      if (nameMatch) {
        state.profile.preferredName = nameMatch[1].trim();
      }
      const rememberMatch = /(?:remember that|ingat ya|catat)\s+(.+)/i.exec(text);
      if (rememberMatch) {
        this.rememberFact(userId, rememberMatch[1].trim(), ["explicit"], now);
      }
    }
  }

  rememberFact(userId: string, fact: string, tags: string[] = [], now: number = Date.now()): void {
    const state = this.getOrCreate(userId);
    state.episodicFacts.push({
      id: `mem_${crypto.randomUUID().slice(0, 8)}`,
      fact,
      tags,
      createdAt: now
    });
  }

  recallFacts(userId: string, query: string, limit = 5): string[] {
    const state = this.getOrCreate(userId);
    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    if (qTokens.length === 0) {
      return state.episodicFacts.slice(-limit).map((f) => f.fact);
    }

    return state.episodicFacts
      .map((f) => {
        const lower = f.fact.toLowerCase();
        const hits = qTokens.reduce((acc, tok) => acc + (lower.includes(tok) ? 1 : 0), 0);
        return { fact: f.fact, hits, createdAt: f.createdAt };
      })
      .filter((x) => x.hits > 0 || state.episodicFacts.length <= limit)
      .sort((a, b) => b.hits - a.hits || b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((x) => x.fact);
  }
}
