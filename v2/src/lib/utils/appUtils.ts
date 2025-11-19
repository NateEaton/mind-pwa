/**
 * AppUtils - Common utility functions for the application
 */

/**
 * Trigger haptic feedback for device vibration
 */
export function triggerHapticFeedback(duration = 50): boolean {
	if ('vibrate' in navigator) {
		try {
			navigator.vibrate(duration);
			return true;
		} catch (error) {
			console.error('Vibration API error:', error);
			return false;
		}
	}
	return false;
}

/**
 * Debounce a function to limit how often it can be called
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout>;
	return function (this: any, ...args: Parameters<T>) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};
}

/**
 * Throttle a function to limit execution frequency
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean;
	return function (this: any, ...args: Parameters<T>) {
		if (!inThrottle) {
			func.apply(this, args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}

/**
 * Device information interface
 */
export interface DeviceInfo {
	userAgent: string;
	viewportWidth: number;
	viewportHeight: number;
	screenWidth: number;
	screenHeight: number;
	pixelRatio: number;
	language: string;
	platform: string;
	online: boolean;
	prefersDarkMode?: boolean;
	prefersReducedMotion?: boolean;
	isStandalone?: boolean;
}

/**
 * Get the device and environment information
 */
export function getDeviceInfo(): DeviceInfo {
	const info: DeviceInfo = {
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
		viewportHeight: window.innerHeight,
		screenWidth: window.screen.width,
		screenHeight: window.screen.height,
		pixelRatio: window.devicePixelRatio || 1,
		language: navigator.language,
		platform: navigator.platform,
		online: navigator.onLine
	};

	// Add progressive web app information if available
	if (window.matchMedia) {
		info.prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		info.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		info.isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;
	}

	return info;
}

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
	return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone an object using JSON serialization
 */
export function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if the code is running in a browser environment
 */
export function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

/**
 * Check if the app is installed as PWA
 */
export function isPWA(): boolean {
	if (!isBrowser()) return false;

	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		(window.navigator as any).standalone === true
	);
}

/**
 * Check if the device is online
 */
export function isOnline(): boolean {
	return isBrowser() ? navigator.onLine : true;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (!isBrowser()) return false;

	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);
		return false;
	}
}

/**
 * Download data as a file
 */
export function downloadFile(data: string, filename: string, mimeType = 'text/plain'): void {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
