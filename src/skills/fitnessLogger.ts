import type { WaflareStore } from "../state/store.ts";
import type { FitnessEntry } from "../types.ts";

/**
 * Natural-language WhatsApp fitness & nutrition logger (fkrein1/whatsapp-fitness-agent pattern).
 */
export function parseAndLogFitnessMessage(
  store: WaflareStore,
  userId: string,
  text: string,
  now: number = Date.now()
): { entry: FitnessEntry | null; reply: string } {
  const clean = text.replace(/^\/fitness\s*/i, "").trim();
  const lower = clean.toLowerCase();

  if (!clean || lower === "summary" || lower === "rekap") {
    const userLogs = store.fitnessLogs.filter((l) => l.userId === userId);
    const totalKm = userLogs.reduce((acc, l) => acc + (l.distanceKm ?? 0), 0);
    const totalKcal = userLogs.reduce((acc, l) => acc + (l.calories ?? 0), 0);
    const latestWeight = [...userLogs].reverse().find((l) => l.weightKg !== undefined)?.weightKg;
    return {
      entry: null,
      reply: `Fitness Summary (${userLogs.length} logs): total run ${totalKm.toFixed(1)} km, logged intake/burn ${totalKcal} kcal${latestWeight ? `, latest weight ${latestWeight} kg` : ""}.`
    };
  }

  const runMatch = /(\d+(?:\.\d+)?)\s*km\b/i.exec(clean);
  const durationMatch = /(\d+)\s*(?:min|mins|menit)\b/i.exec(clean);
  const weightMatch = /(?:weight|bb|berat)\s*:?\s*(\d+(?:\.\d+)?)\s*kg\b/i.exec(clean) ?? /(\d+(?:\.\d+)?)\s*kg\b/i.exec(clean);
  const kcalMatch = /(\d+)\s*(?:kcal|kal|cal|calories|kalori)\b/i.exec(clean);
  const proteinMatch = /(\d+)\s*g\s*protein\b/i.exec(clean);

  let entryType: FitnessEntry["entryType"] = "workout";
  if (runMatch || /\b(run|lari|jog|jogging)\b/i.test(lower)) {
    entryType = "run";
  } else if (kcalMatch || /\b(meal|makan|lunch|dinner|breakfast|sarapan|ayam|nasi|protein)\b/i.test(lower)) {
    entryType = "meal";
  } else if (weightMatch && !/\b(squat|bench|deadlift|angkat)\b/i.test(lower)) {
    entryType = "weight";
  }

  const distanceKm = runMatch ? Number(runMatch[1]) : undefined;
  const durationMin = durationMatch ? Number(durationMatch[1]) : undefined;
  const calories = kcalMatch
    ? Number(kcalMatch[1])
    : distanceKm
      ? Math.round(distanceKm * 62)
      : undefined;
  const weightKg = entryType === "weight" && weightMatch ? Number(weightMatch[1]) : undefined;
  const proteinGrams = proteinMatch ? Number(proteinMatch[1]) : undefined;

  const entry: FitnessEntry = {
    id: `fit_${crypto.randomUUID().slice(0, 8)}`,
    userId,
    entryType,
    summary: clean,
    distanceKm,
    durationMin,
    calories,
    proteinGrams,
    weightKg,
    loggedAt: now
  };
  store.fitnessLogs.push(entry);

  const metrics: string[] = [];
  if (distanceKm !== undefined) metrics.push(`${distanceKm} km`);
  if (durationMin !== undefined) metrics.push(`${durationMin} min`);
  if (calories !== undefined) metrics.push(`${calories} kcal`);
  if (proteinGrams !== undefined) metrics.push(`${proteinGrams}g protein`);
  if (weightKg !== undefined) metrics.push(`${weightKg} kg`);

  return {
    entry,
    reply: `Logged [${entry.entryType.toUpperCase()}]: "${entry.summary}" (${metrics.join(", ") || "recorded"}). Total logs: ${store.fitnessLogs.filter((l) => l.userId === userId).length}.`
  };
}
