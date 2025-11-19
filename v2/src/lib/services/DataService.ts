import type { DailyCounts, HistoryEntry, AppSettings, AppMetadata, ExportData } from '$lib/types';
import { browser } from '$app/environment';

/**
 * DataService - Handles data persistence with localStorage
 *
 * This service manages all data storage operations for the MIND Diet Tracker.
 * Uses localStorage for simplicity and immediate persistence.
 */

const STORAGE_KEYS = {
	DAILY_COUNTS: 'mindDiet_dailyCounts',
	HISTORY: 'mindDiet_history',
	SETTINGS: 'mindDiet_settings',
	METADATA: 'mindDiet_metadata',
	DEVICE_ID: 'mindDiet_deviceId',
	SYNC_ENCRYPTION_KEY: 'mindDiet_syncKey'
} as const;

/**
 * Generate a unique UUID
 */
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export class DataService {
	/**
	 * Check if we're in a browser environment
	 */
	private static isBrowser(): boolean {
		return browser && typeof localStorage !== 'undefined';
	}

	/**
	 * Get or create a unique device ID
	 */
	static getDeviceId(): string {
		if (!this.isBrowser()) return 'ssr-device';

		let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
		if (!deviceId) {
			deviceId = generateUUID();
			localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
		}

		return deviceId;
	}

	/**
	 * Load daily counts from localStorage
	 */
	static loadDailyCounts(): DailyCounts {
		if (!this.isBrowser()) return {};

		try {
			const data = localStorage.getItem(STORAGE_KEYS.DAILY_COUNTS);
			return data ? JSON.parse(data) : {};
		} catch (error) {
			console.error('Error loading daily counts:', error);
			return {};
		}
	}

	/**
	 * Save daily counts to localStorage
	 */
	static saveDailyCounts(counts: DailyCounts): void {
		if (!this.isBrowser()) return;

		try {
			localStorage.setItem(STORAGE_KEYS.DAILY_COUNTS, JSON.stringify(counts));
		} catch (error) {
			console.error('Error saving daily counts:', error);
		}
	}

	/**
	 * Load history from localStorage
	 */
	static loadHistory(): HistoryEntry[] {
		if (!this.isBrowser()) return [];

		try {
			const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
			return data ? JSON.parse(data) : [];
		} catch (error) {
			console.error('Error loading history:', error);
			return [];
		}
	}

	/**
	 * Save history to localStorage
	 */
	static saveHistory(history: HistoryEntry[]): void {
		if (!this.isBrowser()) return;

		try {
			localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
		} catch (error) {
			console.error('Error saving history:', error);
		}
	}

	/**
	 * Load settings
	 */
	static loadSettings(): AppSettings {
		if (!this.isBrowser()) {
			return {
				weekStartDay: 'Sunday',
				theme: 'auto',
				cloudSyncEnabled: false
			};
		}

		try {
			const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
			return data
				? JSON.parse(data)
				: {
						weekStartDay: 'Sunday',
						theme: 'auto',
						cloudSyncEnabled: false
					};
		} catch (error) {
			console.error('Error loading settings:', error);
			return {
				weekStartDay: 'Sunday',
				theme: 'auto',
				cloudSyncEnabled: false
			};
		}
	}

	/**
	 * Save settings
	 */
	static saveSettings(settings: AppSettings): void {
		if (!this.isBrowser()) return;

		try {
			localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
		} catch (error) {
			console.error('Error saving settings:', error);
		}
	}

	/**
	 * Load metadata
	 */
	static loadMetadata(): AppMetadata {
		if (!this.isBrowser()) {
			return {
				lastModified: null,
				weekStartDay: 'Sunday',
				deviceId: 'ssr-device'
			};
		}

		try {
			const data = localStorage.getItem(STORAGE_KEYS.METADATA);
			const metadata: AppMetadata = data
				? JSON.parse(data)
				: {
						lastModified: null,
						weekStartDay: 'Sunday'
					};

			// Ensure deviceId is present
			if (!metadata.deviceId) {
				metadata.deviceId = this.getDeviceId();
			}

			return metadata;
		} catch (error) {
			console.error('Error loading metadata:', error);
			return {
				lastModified: null,
				weekStartDay: 'Sunday',
				deviceId: this.getDeviceId()
			};
		}
	}

	/**
	 * Save metadata
	 */
	static saveMetadata(metadata: AppMetadata): void {
		if (!this.isBrowser()) return;

		try {
			localStorage.setItem(STORAGE_KEYS.METADATA, JSON.stringify(metadata));
		} catch (error) {
			console.error('Error saving metadata:', error);
		}
	}

	/**
	 * Export all data as JSON
	 */
	static exportData(): ExportData {
		return {
			dailyCounts: this.loadDailyCounts(),
			history: this.loadHistory(),
			settings: this.loadSettings(),
			metadata: this.loadMetadata(),
			exportDate: new Date().toISOString()
		};
	}

	/**
	 * Import data from JSON
	 */
	static importData(data: ExportData): boolean {
		if (!this.isBrowser()) return false;

		try {
			if (data.dailyCounts) this.saveDailyCounts(data.dailyCounts);
			if (data.history) this.saveHistory(data.history);
			if (data.settings) this.saveSettings(data.settings);
			if (data.metadata) this.saveMetadata(data.metadata);

			return true;
		} catch (error) {
			console.error('Error importing data:', error);
			return false;
		}
	}

	/**
	 * Clear all data
	 */
	static clearAllData(): void {
		if (!this.isBrowser()) return;

		Object.values(STORAGE_KEYS).forEach((key) => {
			localStorage.removeItem(key);
		});
	}

	/**
	 * Get sync encryption key
	 */
	static getSyncEncryptionKey(): string | null {
		if (!this.isBrowser()) return null;

		return localStorage.getItem(STORAGE_KEYS.SYNC_ENCRYPTION_KEY);
	}

	/**
	 * Save sync encryption key
	 */
	static saveSyncEncryptionKey(key: string): void {
		if (!this.isBrowser()) return;

		localStorage.setItem(STORAGE_KEYS.SYNC_ENCRYPTION_KEY, key);
	}

	/**
	 * Remove sync encryption key
	 */
	static removeSyncEncryptionKey(): void {
		if (!this.isBrowser()) return;

		localStorage.removeItem(STORAGE_KEYS.SYNC_ENCRYPTION_KEY);
	}

	/**
	 * Check if data exists
	 */
	static hasData(): boolean {
		if (!this.isBrowser()) return false;

		const dailyCounts = this.loadDailyCounts();
		const history = this.loadHistory();

		return Object.keys(dailyCounts).length > 0 || history.length > 0;
	}

	/**
	 * Get storage usage estimate
	 */
	static getStorageSize(): number {
		if (!this.isBrowser()) return 0;

		let totalSize = 0;

		Object.values(STORAGE_KEYS).forEach((key) => {
			const value = localStorage.getItem(key);
			if (value) {
				totalSize += value.length * 2; // Approximate bytes (UTF-16)
			}
		});

		return totalSize;
	}
}
