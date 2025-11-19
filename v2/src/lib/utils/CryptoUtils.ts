/**
 * CryptoUtils - Client-side encryption using Web Crypto API
 *
 * Provides AES-GCM encryption for sync documents.
 * All encryption happens client-side - the server never sees plaintext.
 */

/**
 * Generate a new AES-GCM encryption key
 */
export async function generateKey(): Promise<CryptoKey> {
	return await crypto.subtle.generateKey(
		{
			name: 'AES-GCM',
			length: 256
		},
		true, // extractable
		['encrypt', 'decrypt']
	);
}

/**
 * Export a CryptoKey to a base64 string for storage
 */
export async function exportKey(key: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('raw', key);
	const exportedKeyBuffer = new Uint8Array(exported);
	const base64 = btoa(String.fromCharCode(...exportedKeyBuffer));
	return base64;
}

/**
 * Import a base64 string back to a CryptoKey
 */
export async function importKey(base64Key: string): Promise<CryptoKey> {
	const binaryString = atob(base64Key);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	return await crypto.subtle.importKey(
		'raw',
		bytes,
		{
			name: 'AES-GCM',
			length: 256
		},
		true,
		['encrypt', 'decrypt']
	);
}

/**
 * Encrypt data using AES-GCM
 * Returns base64-encoded string with IV prepended
 */
export async function encrypt(data: string, key: CryptoKey): Promise<string> {
	// Generate a random IV (Initialization Vector)
	const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits recommended for GCM

	// Encode the data
	const encoder = new TextEncoder();
	const encodedData = encoder.encode(data);

	// Encrypt
	const encrypted = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: iv
		},
		key,
		encodedData
	);

	// Combine IV and encrypted data
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.length);

	// Convert to base64
	const base64 = btoa(String.fromCharCode(...combined));
	return base64;
}

/**
 * Decrypt data using AES-GCM
 * Expects base64-encoded string with IV prepended
 */
export async function decrypt(encryptedBase64: string, key: CryptoKey): Promise<string> {
	// Decode base64
	const binaryString = atob(encryptedBase64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// Extract IV (first 12 bytes)
	const iv = bytes.slice(0, 12);

	// Extract encrypted data (rest of bytes)
	const encryptedData = bytes.slice(12);

	// Decrypt
	const decrypted = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: iv
		},
		key,
		encryptedData
	);

	// Decode the decrypted data
	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}

/**
 * Generate a random sync document ID
 */
export function generateSyncDocId(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a shareable sync URL with document ID and encryption key
 */
export function createSyncUrl(workerUrl: string, docId: string, encryptionKey: string): string {
	return `${workerUrl}/sync/${docId}#key=${encryptionKey}`;
}

/**
 * Parse a sync URL to extract document ID and encryption key
 */
export function parseSyncUrl(syncUrl: string): { docId: string; encryptionKey: string } | null {
	try {
		const url = new URL(syncUrl);
		const pathMatch = url.pathname.match(/\/sync\/([a-zA-Z0-9-]+)$/);

		if (!pathMatch) return null;

		const docId = pathMatch[1];
		const hash = url.hash.substring(1); // Remove '#'
		const params = new URLSearchParams(hash);
		const encryptionKey = params.get('key');

		if (!encryptionKey) return null;

		return { docId, encryptionKey };
	} catch (error) {
		console.error('Error parsing sync URL:', error);
		return null;
	}
}
