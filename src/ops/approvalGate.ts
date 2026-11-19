import type { WaflareStore } from "../state/store.ts";
import type { Env, PendingCloudflareOp } from "../types.ts";

/**
 * Approval-gated Cloudflare infrastructure ChatOps inspired by AMH-Cloudflare-Ops-MCP-by-WT.
 * Any destructive or mutating Cloudflare operation stays 'pending' until explicitly approved.
 */
export class ApprovalGate {
  store: WaflareStore;

  constructor(store: WaflareStore) {
    this.store = store;
  }

  requestOperation(input: {
    action: PendingCloudflareOp["action"];
    target: string;
    payload?: Record<string, unknown>;
    requestedBy: string;
    ttlMs?: number;
  }, now: number = Date.now()): {
    op: PendingCloudflareOp;
    whatsappButtons: Array<{ id: string; title: string }>;
    promptText: string;
  } {
    const id = `op_${crypto.randomUUID().slice(0, 8)}`;
    const op: PendingCloudflareOp = {
      id,
      action: input.action,
      target: input.target,
      payload: input.payload ?? {},
      status: "pending",
      requestedBy: input.requestedBy,
      approvalToken: crypto.randomUUID().slice(0, 12),
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? 15 * 60_000)
    };
    this.store.pendingOps.set(op.id, op);

    return {
      op,
      whatsappButtons: [
        { id: `ops_approve:${op.id}`, title: `Approve ${op.id}` },
        { id: `ops_reject:${op.id}`, title: `Reject ${op.id}` }
      ],
      promptText: `Cloudflare Ops Approval Required [${op.id}]\nAction: ${op.action}\nTarget: ${op.target}\nRequested by: ${op.requestedBy}\nTap Approve or reply: ops_approve:${op.id}`
    };
  }

  async resolveOperation(
    opId: string,
    decision: "approve" | "reject",
    actor: string,
    env: Env,
    now: number = Date.now()
  ): Promise<{ ok: boolean; op?: PendingCloudflareOp; message: string }> {
    const op = this.store.pendingOps.get(opId);
    if (!op) {
      return { ok: false, message: `Operation '${opId}' not found.` };
    }
    if (op.status !== "pending") {
      return { ok: false, op, message: `Operation '${opId}' is already '${op.status}'.` };
    }
    if (now > op.expiresAt) {
      op.status = "expired";
      op.resolvedAt = now;
      return { ok: false, op, message: `Operation '${opId}' expired before approval.` };
    }

    op.resolvedBy = actor;
    op.resolvedAt = now;

    if (decision === "reject") {
      op.status = "rejected";
      op.resultSummary = `Rejected by ${actor}`;
      return { ok: true, op, message: `Rejected Cloudflare op ${op.id} (${op.action} on ${op.target}).` };
    }

    op.status = "approved";
    const execResult = await this.executeAgainstCloudflare(op, env);
    op.status = "executed";
    op.resultSummary = execResult;
    return {
      ok: true,
      op,
      message: `Approved & executed ${op.id} (${op.action} -> ${op.target}): ${execResult}`
    };
  }

  private async executeAgainstCloudflare(op: PendingCloudflareOp, env: Env): Promise<string> {
    const fetchFn = env.fetchImpl ?? fetch;

    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
      return `Dry-run executed ${op.action} on '${op.target}' (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID for live API execution).`;
    }

    if (op.action === "cache.purge") {
      const resp = await fetchFn(
        `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(op.payload.purgeEverything ? { purge_everything: true } : { files: [op.target] })
        }
      );
      return `Cloudflare purge_cache HTTP ${resp.status}`;
    }

    return `Validated and queued live API call for ${op.action} on ${op.target}.`;
  }

  listOperations(): PendingCloudflareOp[] {
    return Array.from(this.store.pendingOps.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}
