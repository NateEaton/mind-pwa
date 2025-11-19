/**
 * Type definitions for MIND Diet Tracker
 */

export interface FoodGroup {
	id: string;
	name: string;
	frequency: 'day' | 'week';
	target: number;
	unit: string;
	type: 'positive' | 'limit';
	description: string;
	isOptional?: boolean;
}

export interface DailyCounts {
	[date: string]: {
		[foodGroupId: string]: number;
	};
}

export interface WeeklyCounts {
	[foodGroupId: string]: number;
}

export interface HistoryEntry {
	weekStartDate: string;
	weeklyCounts: WeeklyCounts;
	dailyEntries: {
		[date: string]: {
			[foodGroupId: string]: number;
		};
	};
	lastModified: string;
}

export interface AppSettings {
	weekStartDay: 'Sunday' | 'Monday';
	theme: 'light' | 'dark' | 'auto';
	cloudSyncEnabled: boolean;
	syncDocId?: string;
	encryptionKey?: string;
}

export interface AppMetadata {
	lastModified: string | null;
	weekStartDay: 'Sunday' | 'Monday';
	syncGenerationId?: string;
	deviceId?: string;
}

export interface SyncDocument {
	metadata: {
		availableWeeks: string[];
		syncGenerationId: string;
		lastModified: string;
	};
	persistent: {
		settings: AppSettings;
		metadata: AppMetadata;
	};
	weeks: {
		[weekKey: string]: {
			dailyEntries: {
				[date: string]: {
					[foodGroupId: string]: number;
				};
			};
			weeklyCounts: WeeklyCounts;
			lastModified: string;
		};
	};
}

export interface ExportData {
	dailyCounts: DailyCounts;
	history: HistoryEntry[];
	settings: AppSettings;
	metadata: AppMetadata;
	exportDate: string;
}
