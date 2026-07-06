/**
 * IndexedDB layer for GURU AI's offline-first storage.
 *
 * Two object stores:
 *
 *  - `syncQueue`  : every action the user takes (mark attendance, save a note,
 *                   queue an upload) is written here FIRST, before anything
 *                   touches the network. This is what survives a page reload,
 *                   a browser crash, or a device that never regains signal
 *                   until the next school day.
 *
 *  - `cache`      : last-known-good copies of server data (student list,
 *                   attendance, notes) so the UI has something real to show
 *                   while offline, not just blank loading states.
 *
 * This module has no React in it on purpose — it's pure browser storage and
 * can be unit-tested or reused from a service worker.
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export type SyncOpType =
  | "attendance.mark"
  | "note.create"
  | "note.update"
  | "note.delete"
  | "lesson_upload.create"
  | "announcement.create"
  | "study_material.create"
  | "homework.create"
  | "homework.submit";

export type QueuedOpStatus = "pending" | "syncing" | "synced" | "failed";

export interface QueuedOp {
  clientOpId: string; // uuid, generated on-device — the idempotency key the backend dedupes on
  type: SyncOpType;
  payload: Record<string, unknown>;
  createdAt: string; // ISO timestamp, set the moment the user acted
  status: QueuedOpStatus;
  attempts: number;
  lastError?: string;
}

interface GuruDBSchema extends DBSchema {
  syncQueue: {
    key: string; // clientOpId
    value: QueuedOp;
    indexes: { "by-status": QueuedOpStatus };
  };
  cache: {
    key: string; // e.g. "students", "notes", "attendance:2026-07-05"
    value: { key: string; value: unknown; updatedAt: string };
  };
}

const DB_NAME = "guru-ai-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GuruDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<GuruDBSchema>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
  if (!dbPromise) {
    dbPromise = openDB<GuruDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const queue = db.createObjectStore("syncQueue", { keyPath: "clientOpId" });
        queue.createIndex("by-status", "status");
        db.createObjectStore("cache", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

/* ------------------------------------------------------------------ */
/*  Queue operations                                                    */
/* ------------------------------------------------------------------ */

export async function enqueueOp(op: Omit<QueuedOp, "status" | "attempts">): Promise<QueuedOp> {
  const db = await getDB();
  const full: QueuedOp = { ...op, status: "pending", attempts: 0 };
  await db.put("syncQueue", full);
  return full;
}

export async function getPendingOps(): Promise<QueuedOp[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("syncQueue", "by-status", "pending");
  const failed = await db.getAllFromIndex("syncQueue", "by-status", "failed");
  return [...all, ...failed].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getAllOps(): Promise<QueuedOp[]> {
  const db = await getDB();
  return db.getAll("syncQueue");
}

export async function markOpStatus(
  clientOpId: string,
  status: QueuedOpStatus,
  extra?: { lastError?: string },
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("syncQueue", clientOpId);
  if (!existing) return;
  await db.put("syncQueue", {
    ...existing,
    status,
    attempts: status === "failed" ? existing.attempts + 1 : existing.attempts,
    lastError: extra?.lastError,
  });
}

export async function removeSyncedOp(clientOpId: string): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", clientOpId);
}

export async function countPending(): Promise<number> {
  const db = await getDB();
  const pending = await db.countFromIndex("syncQueue", "by-status", "pending");
  const failed = await db.countFromIndex("syncQueue", "by-status", "failed");
  return pending + failed;
}

/* ------------------------------------------------------------------ */
/*  Local cache (read-side)                                             */
/* ------------------------------------------------------------------ */

export async function setCached<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put("cache", { key, value, updatedAt: new Date().toISOString() });
}

export async function getCached<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const row = await db.get("cache", key);
  return (row?.value as T) ?? null;
}
