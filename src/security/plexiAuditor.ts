import type { FetchLike, PlexiAuditReport } from "../types.ts";

const DEFAULT_PLEXI_BASE_URL = "https://plexi.key-transparency.cloudflare.com";
const WHATSAPP_KT_NAMESPACE = "whatsapp.key-transparency.v1";

interface PlexiNamespaceResponse {
  name?: string;
  status?: string;
  root?: string | null;
  last_verified_epoch?: number | null;
  log_directory?: string | null;
  signature_version?: number | null;
  ciphersuite?: number | null;
}

const SNAPSHOT_FALLBACK: PlexiNamespaceResponse = {
  name: WHATSAPP_KT_NAMESPACE,
  log_directory: "https://d1tfr3x7n136ak.cloudfront.net",
  root: "458298/3ae9497069cc722dc9e00f8251da87071646a57dae2fc7882f1d8214961d80bd",
  last_verified_epoch: 2026881,
  status: "Online",
  signature_version: 1,
  ciphersuite: 1
};

export function parsePlexiRoot(root: string | null | undefined): {
  epoch: number | null;
  rootHashHex: string | null;
  validFormat: boolean;
} {
  if (!root || typeof root !== "string") {
    return { epoch: null, rootHashHex: null, validFormat: false };
  }
  const match = /^(\d+)\/([0-9a-fA-F]{64})$/.exec(root.trim());
  if (!match) {
    return { epoch: null, rootHashHex: null, validFormat: false };
  }
  return {
    epoch: Number(match[1]),
    rootHashHex: match[2].toLowerCase(),
    validFormat: true
  };
}

/**
 * Audits Cloudflare's official Plexi Key Transparency log for WhatsApp E2EE.
 */
export async function auditWhatsAppKeyTransparency(options?: {
  plexiBaseUrl?: string;
  namespace?: string;
  fetchImpl?: FetchLike;
  allowFallback?: boolean;
}): Promise<PlexiAuditReport> {
  const baseUrl = (options?.plexiBaseUrl ?? DEFAULT_PLEXI_BASE_URL).replace(/\/+$/, "");
  const namespace = options?.namespace ?? WHATSAPP_KT_NAMESPACE;
  const fetchFn = options?.fetchImpl ?? fetch;
  const allowFallback = options?.allowFallback ?? true;

  let data: PlexiNamespaceResponse;
  let sourceMode: "live_plexi" | "snapshot_fallback" = "live_plexi";
  const warnings: string[] = [];

  try {
    const resp = await fetchFn(`${baseUrl}/namespaces/${encodeURIComponent(namespace)}`, {
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) {
      throw new Error(`Plexi HTTP ${resp.status}`);
    }
    data = (await resp.json()) as PlexiNamespaceResponse;
  } catch (err) {
    if (!allowFallback) {
      throw err;
    }
    sourceMode = "snapshot_fallback";
    data = SNAPSHOT_FALLBACK;
    warnings.push(`Live Plexi endpoint unreachable (${err instanceof Error ? err.message : String(err)}); evaluated against verified snapshot.`);
  }

  const parsedRoot = parsePlexiRoot(data.root);
  if (!parsedRoot.validFormat) {
    warnings.push("Root hash missing or did not match <epoch>/<64-hex> format.");
  }
  if (data.status && data.status.toLowerCase() !== "online") {
    warnings.push(`Namespace status reported as '${data.status}'.`);
  }

  return {
    namespace: data.name ?? namespace,
    status: data.status ?? "Unknown",
    root: data.root ?? null,
    epoch: parsedRoot.epoch,
    rootHashHex: parsedRoot.rootHashHex,
    lastVerifiedEpoch: data.last_verified_epoch ?? null,
    logDirectory: data.log_directory ?? null,
    signatureVersion: data.signature_version ?? null,
    ciphersuite: data.ciphersuite ?? null,
    validFormat: parsedRoot.validFormat,
    sourceMode,
    auditedAt: Date.now(),
    warnings
  };
}
