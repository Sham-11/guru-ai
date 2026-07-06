"use client";

import { useCallback, useEffect, useState } from "react";
import { syncManager, type SyncStatus } from "../lib/offline/syncManager";
import type { SyncOpType } from "../lib/offline/db";

export interface OfflineSync {
  status: SyncStatus;
  pendingCount: number;
  /** True while `status` should render as "offline" in the UI (real or forced). */
  isOffline: boolean;
  /** Record an action. Writes to IndexedDB immediately; syncs when online. */
  enqueue: (type: SyncOpType, payload: Record<string, unknown>) => Promise<void>;
  /** Drives the demo toggle in the top nav — simulates offline even with real internet. */
  setForcedOffline: (forced: boolean) => void;
}

export function useOfflineSync(): OfflineSync {
  const [status, setStatus] = useState<SyncStatus>("online-idle");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    syncManager.init();
    const unsubscribe = syncManager.subscribe((s, count) => {
      setStatus(s);
      setPendingCount(count);
    });
    return unsubscribe;
  }, []);

  const enqueue = useCallback(
    (type: SyncOpType, payload: Record<string, unknown>) => syncManager.enqueue(type, payload),
    [],
  );

  const setForcedOffline = useCallback((forced: boolean) => syncManager.setForcedOffline(forced), []);

  return {
    status,
    pendingCount,
    isOffline: status === "offline",
    enqueue,
    setForcedOffline,
  };
}
