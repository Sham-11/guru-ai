/**
 * Sync manager — the piece that turns "a pile of queued actions in
 * IndexedDB" into "data safely in MongoDB", the moment there's a connection.
 *
 * Responsibilities:
 *  1. Track connectivity (real navigator.onLine + a manual "force offline"
 *     override, so the demo toggle in the UI still works even on a machine
 *     with real internet).
 *  2. Flush the queue to POST /api/sync/batch, in batches, with the backend's
 *     idempotency key (clientOpId) so retries are always safe.
 *  3. Retry failed ops with exponential backoff instead of hammering the API.
 *  4. Broadcast status changes (a tiny pub/sub) so any component — the nav
 *     pill, a toast, a dashboard stat — can reflect real state.
 *
 * This module is framework-agnostic; hooks/useOfflineSync.ts is the React
 * binding on top of it.
 */
import { apiFetch } from "../api";
import {
  countPending,
  getPendingOps,
  markOpStatus,
  removeSyncedOp,
  enqueueOp as dbEnqueueOp,
  type QueuedOp,
  type SyncOpType,
} from "./db";

export type SyncStatus = "offline" | "online-idle" | "syncing" | "synced" | "sync-error";

type Listener = (status: SyncStatus, pendingCount: number) => void;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 6;

class SyncManager {
  private listeners = new Set<Listener>();
  private status: SyncStatus = "online-idle";
  private forcedOffline = false;
  private flushing = false;
  private initialized = false;

  init() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    window.addEventListener("online", () => this.handleConnectivityChange());
    window.addEventListener("offline", () => this.handleConnectivityChange());

    // Background Sync API: if the browser supports it, the service worker
    // will fire a 'sync' event the moment connectivity returns even if the
    // tab was backgrounded. We listen for its message here.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "GURU_SYNC_TRIGGER") {
          this.flush();
        }
      });
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          // Service workers require HTTPS or localhost; fail silently in
          // unsupported dev setups — the app still works via the online/offline
          // event listeners above, just without background-tab sync.
        });
    }

    this.handleConnectivityChange();
    this.updatePendingCountAndNotify();
    // Periodic safety-net flush in case an 'online' event was missed.
    setInterval(() => {
      if (this.isOnline()) this.flush();
    }, 15000);
  }

  private isOnline(): boolean {
    if (this.forcedOffline) return false;
    return typeof navigator === "undefined" ? true : navigator.onLine;
  }

  private handleConnectivityChange() {
    if (this.isOnline()) {
      this.setStatus("online-idle");
      this.flush();
    } else {
      this.setStatus("offline");
    }
  }

  /** Lets the UI's demo toggle simulate offline mode even with real connectivity. */
  setForcedOffline(forced: boolean) {
    this.forcedOffline = forced;
    this.handleConnectivityChange();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status, 0);
    this.updatePendingCountAndNotify();
    return () => this.listeners.delete(listener);
  }

  private async updatePendingCountAndNotify() {
    const pending = await countPending();
    for (const l of this.listeners) l(this.status, pending);
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.updatePendingCountAndNotify();
  }

  /** The one entry point the rest of the app calls to record an action. */
  async enqueue(type: SyncOpType, payload: Record<string, unknown>): Promise<void> {
    const clientOpId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await dbEnqueueOp({
      clientOpId,
      type,
      payload,
      createdAt: new Date().toISOString(),
    });

    await this.updatePendingCountAndNotify();

    if (this.isOnline()) {
      this.flush();
    } else if ("serviceWorker" in navigator && "SyncManager" in window) {
      // Register a one-off background sync so the OS wakes the SW when
      // connectivity returns, even if this tab is closed.
      navigator.serviceWorker.ready
        .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("guru-flush-queue"))
        .catch(() => {});
    }
  }

  /** Push every pending/failed op to the backend, batch by batch. */
  async flush(): Promise<void> {
    if (this.flushing || !this.isOnline()) return;
    this.flushing = true;

    try {
      let pending = await getPendingOps();
      if (pending.length === 0) {
        this.setStatus("online-idle");
        return;
      }

      this.setStatus("syncing");
      let anyError = false;

      while (pending.length > 0) {
        const batch = pending.slice(0, BATCH_SIZE).filter((op) => op.attempts < MAX_ATTEMPTS);
        if (batch.length === 0) break;

        for (const op of batch) await markOpStatus(op.clientOpId, "syncing");

        try {
          const res = await apiFetch<{ results: { client_op_id: string; status: string; detail?: string }[] }>(
            "/api/sync/batch",
            {
              method: "POST",
              body: JSON.stringify({
                ops: batch.map((op: QueuedOp) => ({
                  client_op_id: op.clientOpId,
                  type: op.type,
                  payload: op.payload,
                  created_at: op.createdAt,
                })),
              }),
            },
          );

          for (const r of res.results) {
            if (r.status === "applied" || r.status === "duplicate") {
              await removeSyncedOp(r.client_op_id);
            } else {
              anyError = true;
              await markOpStatus(r.client_op_id, "failed", { lastError: r.detail });
            }
          }
        } catch (err) {
          // Network dropped mid-flush, or backend unreachable — leave ops
          // queued as "failed" (they'll be retried) and stop this pass.
          anyError = true;
          for (const op of batch) {
            await markOpStatus(op.clientOpId, "failed", {
              lastError: err instanceof Error ? err.message : "Unknown sync error",
            });
          }
          break;
        }

        pending = await getPendingOps();
      }

      this.setStatus(anyError ? "sync-error" : "synced");
      if (!anyError) {
        // Briefly show "synced" then settle back to idle, matching the
        // "Online · Synced" pill language already in the UI.
        setTimeout(() => this.isOnline() && this.setStatus("online-idle"), 2500);
      }
    } finally {
      this.flushing = false;
    }
  }
}

export const syncManager = new SyncManager();
