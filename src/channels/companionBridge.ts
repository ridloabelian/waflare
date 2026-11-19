import type { WaflareStore } from "../state/store.ts";
import type { CompanionDevice } from "../types.ts";

export interface CompanionOutboundJob {
  jobId: string;
  deviceId: string;
  to: string;
  text: string;
  createdAt: number;
}

/**
 * Coordinates Android foreground services (ZeroClawAndroid) or local Baileys bridges
 * connected over Cloudflare Tunnel.
 */
export class CompanionBridge {
  store: WaflareStore;
  outboundQueue: CompanionOutboundJob[];

  constructor(store: WaflareStore) {
    this.store = store;
    this.outboundQueue = [];
  }

  registerHeartbeat(input: {
    deviceId: string;
    platform: CompanionDevice["platform"];
    tunnelUrl: string;
  }, now: number = Date.now()): CompanionDevice {
    const queuedForDevice = this.outboundQueue.filter((q) => q.deviceId === input.deviceId).length;
    const device: CompanionDevice = {
      deviceId: input.deviceId,
      platform: input.platform,
      tunnelUrl: input.tunnelUrl,
      status: "online",
      lastHeartbeatAt: now,
      queuedMessages: queuedForDevice
    };
    this.store.companions.set(device.deviceId, device);
    return device;
  }

  enqueueForCompanion(deviceId: string, to: string, text: string, now: number = Date.now()): CompanionOutboundJob {
    const job: CompanionOutboundJob = {
      jobId: `cmp_${crypto.randomUUID().slice(0, 8)}`,
      deviceId,
      to,
      text,
      createdAt: now
    };
    this.outboundQueue.push(job);
    const existing = this.store.companions.get(deviceId);
    if (existing) {
      existing.queuedMessages = this.outboundQueue.filter((q) => q.deviceId === deviceId).length;
    }
    return job;
  }

  drainJobs(deviceId: string): CompanionOutboundJob[] {
    const matched: CompanionOutboundJob[] = [];
    const remaining: CompanionOutboundJob[] = [];
    for (const job of this.outboundQueue) {
      if (job.deviceId === deviceId) {
        matched.push(job);
      } else {
        remaining.push(job);
      }
    }
    this.outboundQueue = remaining;
    const existing = this.store.companions.get(deviceId);
    if (existing) {
      existing.queuedMessages = 0;
    }
    return matched;
  }

  listDevices(now: number = Date.now(), staleThresholdMs = 120_000): CompanionDevice[] {
    return Array.from(this.store.companions.values()).map((d) => ({
      ...d,
      status: now - d.lastHeartbeatAt <= staleThresholdMs ? "online" : "offline"
    }));
  }
}
