/**
 * GURU AI service worker.
 *
 * Its only job for offline sync is: register for the 'sync' event with tag
 * "guru-flush-queue" (see lib/offline/syncManager.ts), and when the browser
 * fires it — meaning connectivity has returned, even if no tab is focused —
 * tell every open client to run its flush. The actual IndexedDB read/write
 * and network POST happens on the client (syncManager.ts) because that's
 * where the idb-backed queue and auth token live; the SW is just the wakeup
 * signal that works even when the tab isn't in the foreground.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "guru-flush-queue") {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "GURU_SYNC_TRIGGER" });
  }
}
