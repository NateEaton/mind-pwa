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

const CACHE_NAME = "mind-diet-tracker-v2";

// Core files that should be cached - using simplified list for bundled app
const coreFilesToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-192x192.png",
  "/icons/maskable-icon-512x512.png",
];

// Dynamic asset discovery for Vite bundled files
async function getAssetUrls() {
  try {
    // Fetch the main HTML to discover asset URLs
    const response = await fetch('/index.html');
    const html = await response.text();
    
    const assetUrls = [];
    
    // Extract JS bundle URLs
    const jsMatches = html.matchAll(/<script[^>]*src="([^"]*)"[^>]*>/g);
    for (const match of jsMatches) {
      assetUrls.push(match[1]);
    }
    
    // Extract CSS bundle URLs  
    const cssMatches = html.matchAll(/<link[^>]*href="([^"]*\.css)"[^>]*>/g);
    for (const match of cssMatches) {
      assetUrls.push(match[1]);
    }
    
    return [...coreFilesToCache, ...assetUrls];
  } catch (error) {
    console.error('Service Worker: Failed to discover assets, using core files only:', error);
    return coreFilesToCache;
  }
}

// Install event: Cache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const urlsToCache = await getAssetUrls();
        
        // Cache files individually to handle failures gracefully
        let failedCount = 0;
        const cachePromises = urlsToCache.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            } else {
              failedCount++;
              console.warn(`Failed to cache ${url}: ${response.status}`);
            }
          } catch (error) {
            failedCount++;
            console.warn(`Failed to cache ${url}:`, error);
          }
        });
        
        await Promise.allSettled(cachePromises);
        
        if (failedCount > 0) {
          console.warn(`Service Worker: ${failedCount} files failed to cache`);
        }
      } catch (error) {
        console.error("Service Worker: Cache installation failed:", error);
      }
    })()
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
              // Delete old caches that are not the current one
              return (
                (cacheName.startsWith("mind-diet-tracker-") || 
                 cacheName.startsWith("mind-diet-tracker-v")) &&
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

          // Clone and cache the response silently
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {
              // Silently fail cache writes - not critical
            });
          });

          return networkResponse;
        })
        .catch((error) => {
          // Only log fetch errors for essential resources
          if (event.request.url.includes('.js') || event.request.url.includes('.css') || event.request.url === self.registration.scope) {
            console.error("Service Worker: Failed to fetch essential resource:", event.request.url, error);
          }
        });
    })
  );
});
