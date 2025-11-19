/**
 * MIND Diet Tracker - Cloudflare Worker for Sync
 *
 * Provides a simple REST API for storing and retrieving encrypted sync documents.
 * All data is stored encrypted - the worker never sees plaintext.
 */

interface Env {
	SYNC_KV: KVNamespace;
}

interface SyncDocument {
	encrypted: string;
	lastModified: string;
	docId: string;
}

interface SyncMetadata {
	lastModified: string;
}

// Allowed origins for CORS (update with your domains)
const ALLOWED_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:4173',
	'https://mind-pwa-fawn.vercel.app',
	'https://mind-diet-tracker.vercel.app',
	'https://yourdomain.com' // Replace with your production domain
];

/**
 * Handle CORS preflight requests
 */
function handleOptions(request: Request): Response {
	const origin = request.headers.get('Origin');
	const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': allowedOrigin,
			'Access-Control-Allow-Methods': 'GET, PUT, HEAD, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400',
			'Access-Control-Expose-Headers': 'X-Last-Modified'
		}
	});
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response, request: Request): Response {
	const origin = request.headers.get('Origin');
	const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', allowedOrigin);
	headers.set('Access-Control-Expose-Headers', 'X-Last-Modified');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * Main worker handler
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return handleOptions(request);
		}

		// Health check endpoint
		if (url.pathname === '/ping') {
			const response = new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString() }), {
				headers: { 'Content-Type': 'application/json' }
			});
			return addCorsHeaders(response, request);
		}

		// Sync document endpoint: /sync/{docId}
		const syncMatch = url.pathname.match(/^\/sync\/([a-zA-Z0-9-]+)$/);
		if (!syncMatch) {
			const response = new Response('Not Found', { status: 404 });
			return addCorsHeaders(response, request);
		}

		const docId = syncMatch[1];
		const key = `doc:${docId}`;

		try {
			// GET: Retrieve encrypted document
			if (request.method === 'GET') {
				const data = await env.SYNC_KV.get<SyncDocument>(key, 'json');

				if (!data) {
					const response = new Response(JSON.stringify({ error: 'Document not found' }), {
						status: 404,
						headers: { 'Content-Type': 'application/json' }
					});
					return addCorsHeaders(response, request);
				}

				const response = new Response(JSON.stringify(data), {
					headers: {
						'Content-Type': 'application/json',
						'X-Last-Modified': data.lastModified
					}
				});
				return addCorsHeaders(response, request);
			}

			// HEAD: Check if document exists and get last modified time
			if (request.method === 'HEAD') {
				const metadata = await env.SYNC_KV.get<SyncMetadata>(`${key}:metadata`, 'json');

				if (!metadata) {
					const response = new Response(null, { status: 404 });
					return addCorsHeaders(response, request);
				}

				const response = new Response(null, {
					status: 200,
					headers: {
						'X-Last-Modified': metadata.lastModified
					}
				});
				return addCorsHeaders(response, request);
			}

			// PUT: Store encrypted document
			if (request.method === 'PUT') {
				const body = await request.json<{ encrypted: string }>();

				if (!body.encrypted) {
					const response = new Response(JSON.stringify({ error: 'Missing encrypted data' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					});
					return addCorsHeaders(response, request);
				}

				const now = new Date().toISOString();
				const syncDoc: SyncDocument = {
					encrypted: body.encrypted,
					lastModified: now,
					docId
				};

				const metadata: SyncMetadata = {
					lastModified: now
				};

				// Store both the full document and metadata (for efficient HEAD requests)
				await env.SYNC_KV.put(key, JSON.stringify(syncDoc));
				await env.SYNC_KV.put(`${key}:metadata`, JSON.stringify(metadata));

				const response = new Response(
					JSON.stringify({
						success: true,
						lastModified: now
					}),
					{
						headers: {
							'Content-Type': 'application/json',
							'X-Last-Modified': now
						}
					}
				);
				return addCorsHeaders(response, request);
			}

			// Method not allowed
			const response = new Response('Method Not Allowed', { status: 405 });
			return addCorsHeaders(response, request);
		} catch (error) {
			console.error('Worker error:', error);
			const response = new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error instanceof Error ? error.message : 'Unknown error'
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				}
			);
			return addCorsHeaders(response, request);
		}
	}
};
