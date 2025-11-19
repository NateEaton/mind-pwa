import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Network Status Store
 *
 * Tracks online/offline status and provides reactive updates
 * when network connectivity changes.
 */

/**
 * Online status (true = online, false = offline)
 */
export const isOnline = writable(browser ? navigator.onLine : true);

/**
 * Connection quality estimate (experimental)
 */
export const connectionQuality = writable<'good' | 'fair' | 'poor' | 'offline'>('good');

/**
 * Whether sync should be allowed (considers online status and user preferences)
 */
export const canSync = derived(isOnline, ($isOnline) => {
	return $isOnline;
});

// Set up event listeners in browser environment
if (browser) {
	// Update status when connection changes
	window.addEventListener('online', () => {
		isOnline.set(true);
		console.info('Network connection restored');
	});

	window.addEventListener('offline', () => {
		isOnline.set(false);
		console.warn('Network connection lost');
	});

	// Monitor connection quality if available
	if ('connection' in navigator && (navigator as any).connection) {
		const connection = (navigator as any).connection;

		const updateConnectionQuality = () => {
			const effectiveType = connection.effectiveType;

			if (!navigator.onLine) {
				connectionQuality.set('offline');
			} else if (effectiveType === '4g') {
				connectionQuality.set('good');
			} else if (effectiveType === '3g') {
				connectionQuality.set('fair');
			} else {
				connectionQuality.set('poor');
			}
		};

		connection.addEventListener('change', updateConnectionQuality);
		updateConnectionQuality(); // Initial check
	}
}

/**
 * Network status actions
 */
export const networkActions = {
	/**
	 * Force refresh of network status
	 */
	refresh() {
		if (browser) {
			isOnline.set(navigator.onLine);
		}
	},

	/**
	 * Get detailed connection info (if available)
	 */
	getConnectionInfo() {
		if (!browser || !('connection' in navigator)) {
			return null;
		}

		const connection = (navigator as any).connection;
		return {
			effectiveType: connection.effectiveType,
			downlink: connection.downlink,
			rtt: connection.rtt,
			saveData: connection.saveData
		};
	}
};
