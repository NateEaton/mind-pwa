/**
 * SyncService - Handles encrypted synchronization with Cloudflare Worker
 *
 * Implements bidirectional sync with conflict resolution using generation IDs.
 * All data is encrypted client-side before being sent to the server.
 */

import type { DailyCounts, HistoryEntry, AppSettings, AppMetadata } from '$lib/types';
import * as CryptoUtils from '$lib/utils/CryptoUtils';

export interface SyncDocument {
	dailyCounts: DailyCounts;
	history: HistoryEntry[];
	settings: AppSettings;
	metadata: AppMetadata;
	generationId: number;
	lastModified: string;
}

export interface SyncConfig {
	workerUrl: string;
	docId: string;
	encryptionKey: CryptoKey;
}

export interface SyncResult {
	success: boolean;
	error?: string;
	pulled: boolean;
	pushed: boolean;
	conflicts: boolean;
}

export interface SyncStatus {
	isSyncing: boolean;
	lastSyncTime: string | null;
	lastError: string | null;
}

/**
 * Main SyncService class
 */
export class SyncService {
	private config: SyncConfig | null = null;
	private status: SyncStatus = {
		isSyncing: false,
		lastSyncTime: null,
		lastError: null
	};
	private autoSyncInterval: number | null = null;
	private statusCallback: ((status: SyncStatus) => void) | null = null;

	/**
	 * Create a new sync document and return the shareable URL
	 */
	async createNewSyncDoc(
		workerUrl: string,
		initialData: Omit<SyncDocument, 'generationId' | 'lastModified'>
	): Promise<{ url: string; docId: string; encryptionKey: string }> {
		try {
			// Generate encryption key and doc ID
			const key = await CryptoUtils.generateKey();
			const keyString = await CryptoUtils.exportKey(key);
			const docId = CryptoUtils.generateSyncDocId();

			// Create initial sync document
			const syncDoc: SyncDocument = {
				...initialData,
				generationId: 1,
				lastModified: new Date().toISOString()
			};

			// Encrypt the document
			const encrypted = await CryptoUtils.encrypt(JSON.stringify(syncDoc), key);

			// Upload to server
			const response = await fetch(`${workerUrl}/sync/${docId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ encrypted })
			});

			if (!response.ok) {
				throw new Error(`Failed to create sync document: ${response.statusText}`);
			}

			// Store config
			this.config = {
				workerUrl,
				docId,
				encryptionKey: key
			};

			// Create shareable URL
			const url = CryptoUtils.createSyncUrl(workerUrl, docId, keyString);

			return { url, docId, encryptionKey: keyString };
		} catch (error) {
			this.updateStatus({ lastError: `Failed to create sync doc: ${error}` });
			throw error;
		}
	}

	/**
	 * Join an existing sync document using a sync URL
	 */
	async joinExistingSyncDoc(syncUrl: string): Promise<SyncDocument> {
		try {
			// Parse the URL
			const parsed = CryptoUtils.parseSyncUrl(syncUrl);
			if (!parsed) {
				throw new Error('Invalid sync URL');
			}

			const { docId, encryptionKey } = parsed;

			// Extract worker URL from sync URL
			const url = new URL(syncUrl);
			const workerUrl = `${url.protocol}//${url.host}`;

			// Import the encryption key
			const key = await CryptoUtils.importKey(encryptionKey);

			// Store config
			this.config = {
				workerUrl,
				docId,
				encryptionKey: key
			};

			// Pull the initial data
			const syncDoc = await this.pullFromServer();

			return syncDoc;
		} catch (error) {
			this.updateStatus({ lastError: `Failed to join sync doc: ${error}` });
			throw error;
		}
	}

	/**
	 * Pull data from the server
	 */
	async pullFromServer(): Promise<SyncDocument> {
		if (!this.config) {
			throw new Error('Sync not configured');
		}

		const { workerUrl, docId, encryptionKey } = this.config;

		try {
			const response = await fetch(`${workerUrl}/sync/${docId}`, {
				method: 'GET'
			});

			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('Sync document not found');
				}
				throw new Error(`Failed to pull data: ${response.statusText}`);
			}

			const data = await response.json();
			const decrypted = await CryptoUtils.decrypt(data.encrypted, encryptionKey);
			const syncDoc: SyncDocument = JSON.parse(decrypted);

			return syncDoc;
		} catch (error) {
			this.updateStatus({ lastError: `Failed to pull from server: ${error}` });
			throw error;
		}
	}

	/**
	 * Push data to the server
	 */
	async pushToServer(localData: SyncDocument): Promise<void> {
		if (!this.config) {
			throw new Error('Sync not configured');
		}

		const { workerUrl, docId, encryptionKey } = this.config;

		try {
			// Encrypt the document
			const encrypted = await CryptoUtils.encrypt(JSON.stringify(localData), encryptionKey);

			// Upload to server
			const response = await fetch(`${workerUrl}/sync/${docId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ encrypted })
			});

			if (!response.ok) {
				throw new Error(`Failed to push data: ${response.statusText}`);
			}
		} catch (error) {
			this.updateStatus({ lastError: `Failed to push to server: ${error}` });
			throw error;
		}
	}

	/**
	 * Check if remote document exists and get metadata
	 */
	async checkRemote(): Promise<{ exists: boolean; lastModified?: string }> {
		if (!this.config) {
			throw new Error('Sync not configured');
		}

		const { workerUrl, docId } = this.config;

		try {
			const response = await fetch(`${workerUrl}/sync/${docId}`, {
				method: 'HEAD'
			});

			if (response.status === 404) {
				return { exists: false };
			}

			if (!response.ok) {
				throw new Error(`Failed to check remote: ${response.statusText}`);
			}

			const lastModified = response.headers.get('Last-Modified') || new Date().toISOString();
			return { exists: true, lastModified };
		} catch (error) {
			this.updateStatus({ lastError: `Failed to check remote: ${error}` });
			throw error;
		}
	}

	/**
	 * Perform bidirectional sync with conflict resolution
	 */
	async performBidirectionalSync(
		localData: SyncDocument,
		onLocalUpdate: (data: SyncDocument) => void
	): Promise<SyncResult> {
		if (!this.config) {
			throw new Error('Sync not configured');
		}

		this.updateStatus({ isSyncing: true, lastError: null });

		try {
			// Check if remote exists
			const remoteCheck = await this.checkRemote();

			if (!remoteCheck.exists) {
				// No remote data, push local data
				await this.pushToServer(localData);
				this.updateStatus({
					isSyncing: false,
					lastSyncTime: new Date().toISOString()
				});
				return {
					success: true,
					pulled: false,
					pushed: true,
					conflicts: false
				};
			}

			// Pull remote data
			const remoteData = await this.pullFromServer();

			// Compare generation IDs for conflict resolution
			if (remoteData.generationId > localData.generationId) {
				// Remote is newer, update local data
				onLocalUpdate(remoteData);
				this.updateStatus({
					isSyncing: false,
					lastSyncTime: new Date().toISOString()
				});
				return {
					success: true,
					pulled: true,
					pushed: false,
					conflicts: false
				};
			} else if (remoteData.generationId < localData.generationId) {
				// Local is newer, push to server
				await this.pushToServer(localData);
				this.updateStatus({
					isSyncing: false,
					lastSyncTime: new Date().toISOString()
				});
				return {
					success: true,
					pulled: false,
					pushed: true,
					conflicts: false
				};
			} else {
				// Same generation - check if data is different
				const localJson = JSON.stringify(localData);
				const remoteJson = JSON.stringify(remoteData);

				if (localJson !== remoteJson) {
					// Conflict: same generation but different data
					// Use last-write-wins based on lastModified timestamp
					const localTime = new Date(localData.lastModified).getTime();
					const remoteTime = new Date(remoteData.lastModified).getTime();

					if (remoteTime > localTime) {
						// Remote wins
						onLocalUpdate(remoteData);
						this.updateStatus({
							isSyncing: false,
							lastSyncTime: new Date().toISOString()
						});
						return {
							success: true,
							pulled: true,
							pushed: false,
							conflicts: true
						};
					} else {
						// Local wins
						await this.pushToServer(localData);
						this.updateStatus({
							isSyncing: false,
							lastSyncTime: new Date().toISOString()
						});
						return {
							success: true,
							pulled: false,
							pushed: true,
							conflicts: true
						};
					}
				}

				// Data is identical, no sync needed
				this.updateStatus({
					isSyncing: false,
					lastSyncTime: new Date().toISOString()
				});
				return {
					success: true,
					pulled: false,
					pushed: false,
					conflicts: false
				};
			}
		} catch (error) {
			this.updateStatus({
				isSyncing: false,
				lastError: `Sync failed: ${error}`
			});
			return {
				success: false,
				error: String(error),
				pulled: false,
				pushed: false,
				conflicts: false
			};
		}
	}

	/**
	 * Start auto-sync with specified interval (in milliseconds)
	 */
	startAutoSync(
		intervalMs: number,
		getLocalData: () => SyncDocument,
		onLocalUpdate: (data: SyncDocument) => void
	): void {
		// Stop any existing auto-sync
		this.stopAutoSync();

		// Set up interval
		this.autoSyncInterval = window.setInterval(() => {
			if (!this.status.isSyncing) {
				const localData = getLocalData();
				this.performBidirectionalSync(localData, onLocalUpdate).catch((error) => {
					console.error('Auto-sync error:', error);
				});
			}
		}, intervalMs);
	}

	/**
	 * Stop auto-sync
	 */
	stopAutoSync(): void {
		if (this.autoSyncInterval !== null) {
			window.clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = null;
		}
	}

	/**
	 * Disconnect from sync (clear config and stop auto-sync)
	 */
	disconnect(): void {
		this.stopAutoSync();
		this.config = null;
		this.updateStatus({
			isSyncing: false,
			lastSyncTime: null,
			lastError: null
		});
	}

	/**
	 * Get current configuration
	 */
	getConfig(): SyncConfig | null {
		return this.config;
	}

	/**
	 * Get current status
	 */
	getStatus(): SyncStatus {
		return { ...this.status };
	}

	/**
	 * Set status callback
	 */
	onStatusChange(callback: (status: SyncStatus) => void): void {
		this.statusCallback = callback;
	}

	/**
	 * Update status and trigger callback
	 */
	private updateStatus(updates: Partial<SyncStatus>): void {
		this.status = { ...this.status, ...updates };
		if (this.statusCallback) {
			this.statusCallback(this.getStatus());
		}
	}

	/**
	 * Restore configuration from saved state
	 */
	async restoreConfig(
		workerUrl: string,
		docId: string,
		encryptionKeyString: string
	): Promise<void> {
		try {
			const key = await CryptoUtils.importKey(encryptionKeyString);
			this.config = {
				workerUrl,
				docId,
				encryptionKey: key
			};
		} catch (error) {
			throw new Error(`Failed to restore sync config: ${error}`);
		}
	}

	/**
	 * Get exportable config (for saving to localStorage)
	 */
	async getExportableConfig(): Promise<{
		workerUrl: string;
		docId: string;
		encryptionKey: string;
	} | null> {
		if (!this.config) {
			return null;
		}

		const { workerUrl, docId, encryptionKey } = this.config;
		const keyString = await CryptoUtils.exportKey(encryptionKey);

		return {
			workerUrl,
			docId,
			encryptionKey: keyString
		};
	}
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

/**
 * Get the singleton SyncService instance
 */
export function getSyncService(): SyncService {
	if (!syncServiceInstance) {
		syncServiceInstance = new SyncService();
	}
	return syncServiceInstance;
}
