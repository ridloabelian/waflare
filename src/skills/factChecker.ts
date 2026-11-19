import type { WaflareStore } from "../state/store.ts";
import type { FactCheckResult } from "../types.ts";

/**
 * Clean-room claim verification engine inspired by es-cierto/es-cierto.
 */
export function verifyClaim(store: WaflareStore, rawText: string): FactCheckResult {
  const claim = rawText.replace(/^\/verify\s*/i, "").trim();
  const tokens = claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  let bestScore = 0;
  let bestMatch = store.factCorpus[0] ?? null;

  for (const entry of store.factCorpus) {
    let overlap = 0;
    for (const tok of tokens) {
      if (entry.keywords.includes(tok)) {
        overlap += 1;
      }
    }
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = entry;
    }
  }

  if (!bestMatch || bestScore < 2) {
    return {
      claim,
      verdict: "unverified",
      confidence: "low",
      explanation: "No primary source match found in the local verified evidence corpus for this claim.",
      sources: []
    };
  }

  return {
    claim,
    verdict: bestMatch.verdict,
    confidence: bestMatch.confidence,
    explanation: bestMatch.explanation,
    sources: bestMatch.sources
  };
}

export function formatFactCheckReply(result: FactCheckResult): string {
  const badgeMap: Record<FactCheckResult["verdict"], string> = {
    true: "TRUE",
    mostly_true: "MOSTLY TRUE",
    mixed: "MIXED",
    false: "FALSE",
    unverified: "UNVERIFIED"
  };
  const srcList = result.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  return `[${badgeMap[result.verdict]} · confidence: ${result.confidence}]\n${result.explanation}${srcList ? `\nSources:\n${srcList}` : ""}`;
}
