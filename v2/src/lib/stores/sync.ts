import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
	getSyncService,
	type SyncDocument,
	type SyncResult
} from '$lib/services/SyncService';
import {
	dailyCounts,
	history,
	settings,
	metadata,
	mindDietActions
} from '$lib/stores/mindDiet';

/**
 * Sync Store - Manages cloud synchronization state
 *
 * Integrates with SyncService to provide encrypted bidirectional sync
 * with Cloudflare Worker + KV storage.
 */

/**
 * Sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/**
 * Sync state interface
 */
export interface SyncState {
	status: SyncStatus;
	lastSyncTime: string | null;
	syncDocId: string | null;
	encryptionKey: string | null;
	workerUrl: string | null;
	error: string | null;
	isPending: boolean;
	autoSyncEnabled: boolean;
}

/**
 * Default worker URL (can be overridden)
 */
const DEFAULT_WORKER_URL = 'https://mind-sync-worker.your-domain.workers.dev';

/**
 * Load sync state from localStorage
 */
function loadSyncState(): SyncState {
	if (!browser) {
		return {
			status: 'idle',
			lastSyncTime: null,
			syncDocId: null,
			encryptionKey: null,
			workerUrl: null,
			error: null,
			isPending: false,
			autoSyncEnabled: false
		};
	}

	try {
		const stored = localStorage.getItem('mindDiet_syncState');
		if (stored) {
			const parsed = JSON.parse(stored);
			// Restore SyncService config if we have it
			if (parsed.workerUrl && parsed.syncDocId && parsed.encryptionKey) {
				const service = getSyncService();
				service
					.restoreConfig(parsed.workerUrl, parsed.syncDocId, parsed.encryptionKey)
					.catch((error) => {
						console.error('Failed to restore sync config:', error);
					});
			}
			return { ...parsed, status: 'idle', isPending: false };
		}
	} catch (error) {
		console.error('Failed to load sync state:', error);
	}

	return {
		status: 'idle',
		lastSyncTime: null,
		syncDocId: null,
		encryptionKey: null,
		workerUrl: null,
		error: null,
		isPending: false,
		autoSyncEnabled: false
	};
}

/**
 * Sync state store
 */
export const syncState = writable<SyncState>(loadSyncState());

/**
 * Save sync state to localStorage
 */
if (browser) {
	syncState.subscribe((state) => {
		try {
			localStorage.setItem('mindDiet_syncState', JSON.stringify(state));
		} catch (error) {
			console.error('Failed to save sync state:', error);
		}
	});
}

/**
 * Derived: Whether sync is ready to use
 */
export const syncReady = derived(syncState, ($syncState) => {
	return (
		$syncState.syncDocId !== null &&
		$syncState.encryptionKey !== null &&
		$syncState.workerUrl !== null
	);
});

/**
 * Derived: Whether sync is currently active
 */
export const isSyncing = derived(syncState, ($syncState) => {
	return $syncState.status === 'syncing';
});

/**
 * Get current app data as a SyncDocument
 */
function getCurrentSyncDocument(): SyncDocument {
	const $dailyCounts = get(dailyCounts);
	const $history = get(history);
	const $settings = get(settings);
	const $metadata = get(metadata);

	return {
		dailyCounts: $dailyCounts,
		history: $history,
		settings: $settings,
		metadata: $metadata,
		generationId: $metadata.version,
		lastModified: new Date().toISOString()
	};
}

/**
 * Update local stores from a SyncDocument
 */
function updateFromSyncDocument(doc: SyncDocument): void {
	dailyCounts.set(doc.dailyCounts);
	history.set(doc.history);
	settings.set(doc.settings);
	metadata.set(doc.metadata);
}

/**
 * Sync actions
 */
export const syncActions = {
	/**
	 * Create a new sync document and get shareable URL
	 */
	async createNewSyncDoc(workerUrl?: string): Promise<string> {
		if (!browser) {
			throw new Error('Sync only available in browser');
		}

		const url = workerUrl || DEFAULT_WORKER_URL;
		const service = getSyncService();

		try {
			syncState.update((state) => ({
				...state,
				status: 'syncing',
				error: null
			}));

			// Get current data
			const currentData = getCurrentSyncDocument();

			// Create sync doc
			const result = await service.createNewSyncDoc(url, currentData);

			// Update state
			syncState.update((state) => ({
				...state,
				status: 'success',
				syncDocId: result.docId,
				encryptionKey: result.encryptionKey,
				workerUrl: url,
				lastSyncTime: new Date().toISOString()
			}));

			return result.url;
		} catch (error) {
			syncState.update((state) => ({
				...state,
				status: 'error',
				error: String(error)
			}));
			throw error;
		}
	},

	/**
	 * Join an existing sync document using a sync URL
	 */
	async joinSyncDoc(syncUrl: string): Promise<void> {
		if (!browser) {
			throw new Error('Sync only available in browser');
		}

		const service = getSyncService();

		try {
			syncState.update((state) => ({
				...state,
				status: 'syncing',
				error: null
			}));

			// Join sync doc and get initial data
			const syncDoc = await service.joinExistingSyncDoc(syncUrl);

			// Update local stores with remote data
			updateFromSyncDocument(syncDoc);

			// Get config
			const config = await service.getExportableConfig();
			if (!config) {
				throw new Error('Failed to get sync config');
			}

			// Update state
			syncState.update((state) => ({
				...state,
				status: 'success',
				syncDocId: config.docId,
				encryptionKey: config.encryptionKey,
				workerUrl: config.workerUrl,
				lastSyncTime: new Date().toISOString()
			}));
		} catch (error) {
			syncState.update((state) => ({
				...state,
				status: 'error',
				error: String(error)
			}));
			throw error;
		}
	},

	/**
	 * Perform bidirectional sync
	 */
	async performSync(): Promise<SyncResult> {
		if (!browser) {
			throw new Error('Sync only available in browser');
		}

		const $syncReady = get(syncReady);
		if (!$syncReady) {
			throw new Error('Sync not configured');
		}

		const service = getSyncService();

		try {
			syncState.update((state) => ({
				...state,
				status: 'syncing',
				error: null
			}));

			// Get current local data
			const localData = getCurrentSyncDocument();

			// Perform bidirectional sync
			const result = await service.performBidirectionalSync(
				localData,
				(remoteData: SyncDocument) => {
					// Update local data if remote is newer
					updateFromSyncDocument(remoteData);
				}
			);

			if (result.success) {
				syncState.update((state) => ({
					...state,
					status: 'success',
					lastSyncTime: new Date().toISOString(),
					error: null
				}));
			} else {
				syncState.update((state) => ({
					...state,
					status: 'error',
					error: result.error || 'Unknown sync error'
				}));
			}

			return result;
		} catch (error) {
			syncState.update((state) => ({
				...state,
				status: 'error',
				error: String(error)
			}));
			throw error;
		}
	},

	/**
	 * Enable auto-sync with specified interval (in minutes)
	 */
	enableAutoSync(intervalMinutes: number = 5): void {
		if (!browser) return;

		const $syncReady = get(syncReady);
		if (!$syncReady) {
			console.warn('Cannot enable auto-sync: sync not configured');
			return;
		}

		const service = getSyncService();
		const intervalMs = intervalMinutes * 60 * 1000;

		service.startAutoSync(
			intervalMs,
			getCurrentSyncDocument,
			(remoteData: SyncDocument) => {
				updateFromSyncDocument(remoteData);
			}
		);

		syncState.update((state) => ({
			...state,
			autoSyncEnabled: true
		}));
	},

	/**
	 * Disable auto-sync
	 */
	disableAutoSync(): void {
		if (!browser) return;

		const service = getSyncService();
		service.stopAutoSync();

		syncState.update((state) => ({
			...state,
			autoSyncEnabled: false
		}));
	},

	/**
	 * Disconnect from sync (clear all sync data)
	 */
	disconnect(): void {
		if (!browser) return;

		const service = getSyncService();
		service.disconnect();

		syncState.set({
			status: 'idle',
			lastSyncTime: null,
			syncDocId: null,
			encryptionKey: null,
			workerUrl: null,
			error: null,
			isPending: false,
			autoSyncEnabled: false
		});
	},

	/**
	 * Mark sync as pending
	 */
	setSyncPending(pending: boolean): void {
		syncState.update((state) => ({
			...state,
			isPending: pending
		}));
	},

	/**
	 * Get sync summary
	 */
	getSyncSummary() {
		const $syncState = get(syncState);
		const $syncReady = get(syncReady);

		return {
			configured: $syncReady,
			status: $syncState.status,
			lastSyncTime: $syncState.lastSyncTime,
			autoSyncEnabled: $syncState.autoSyncEnabled,
			error: $syncState.error
		};
	},

	/**
	 * Set custom worker URL
	 */
	setWorkerUrl(url: string): void {
		syncState.update((state) => ({
			...state,
			workerUrl: url
		}));
	}
};
