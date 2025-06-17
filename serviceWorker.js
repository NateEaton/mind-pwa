/*
 * MIND Diet Tracker PWA
 * Copyright (C) 2025 Nathan A. Eaton Jr.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const CACHE_NAME = "mind-diet-tracker-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/core/logger.js",
  "/utils/appUtils.js",
  "/utils/dateUtils.js",
  "/core/dataService.js",
  "/serviceWorker.js",
  "/core/stateManager.js",
  "/uiRenderer.js",
  "/core/eventHandlers.js",
  "/core/devTools.js",
  "/core/historyModalManager.js",
  "/core/importExportManager.js",
  "/core/settingsManager.js",
  "/core/setupWizard.js",
  "/cloudSync/cloudSync.js",
  "/cloudProviders/googleDriveProvider.js",
  "/cloudProviders/dropboxProvider.js",
  "/cloudSync/changeDetectionService.js",
  "/cloudSync/fileMetadataManager.js",
  "/cloudSync/mergeCoordinator.js",
  "/cloudSync/mergeStrategies.js",
  "/cloudSync/syncOperationHandler.js",
  "/cloudSync/syncUtils.js",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-192x192.png",
  "/icons/maskable-icon-512x512.png",
];

// Install event: Cache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting(); // Activate worker immediately
});

// Activate event: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete caches that are not the current one
              return (
                cacheName.startsWith("mind-diet-tracker-") &&
                cacheName !== CACHE_NAME
              );
            })
            .map((cacheName) => {
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim()) // Take control of pages immediately
  );
});

// Fetch event: Serve from cache first, then network
self.addEventListener("fetch", (event) => {
  // Skip caching for requests with special headers (like Range requests)
  const hasRangeHeader = event.request.headers.get("Range");
  const isDevToolsRequest = event.request.headers.get("cache") === "no-cache";

  // For requests we shouldn't cache, just pass through to network
  if (hasRangeHeader || isDevToolsRequest || event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      // Not in cache - fetch from network, cache it, then return
      return fetch(event.request)
        .then((networkResponse) => {
          // Check if we received a valid response
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          // IMPORTANT: Clone the response. A response is a stream
          // and because we want the browser to consume the response
          // as well as the cache consuming the response, we need
          // to clone it so we have two streams.
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.error("Fetching failed:", error);
        });
    })
  );
});
