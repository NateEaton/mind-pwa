# MIND Diet Sync Worker

Cloudflare Worker for encrypted cloud synchronization of MIND Diet data.

## Features

- **End-to-End Encryption**: All data encrypted client-side with AES-GCM
- **Zero-Knowledge**: Server never sees plaintext data
- **KV Storage**: Fast, distributed key-value storage
- **CORS Support**: Cross-origin requests enabled
- **Simple REST API**: Standard HTTP methods

## Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Create KV Namespaces

Create production KV namespace:
```bash
wrangler kv:namespace create "SYNC_KV"
```

Create development KV namespace:
```bash
wrangler kv:namespace create "SYNC_KV" --env dev
```

Copy the IDs from the output.

### 3. Configure wrangler.toml

Copy the example config:
```bash
cp wrangler.toml.example wrangler.toml
```

Update the KV namespace IDs in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_PRODUCTION_KV_ID"  # Replace with actual ID

[env.dev]
[[env.dev.kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_DEV_KV_ID"  # Replace with actual ID
```

### 4. Configure CORS Origins

Edit `src/index.ts` and update the `ALLOWED_ORIGINS` array with your domain(s):

```typescript
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'http://localhost:5173' // For development
];
```

## Development

Run the worker locally:
```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

## Deployment

### Deploy to Production

```bash
npm run deploy
```

Your worker will be deployed to `https://mind-sync-worker.<your-account>.workers.dev`.

### Deploy to Development Environment

```bash
npm run deploy:dev
```

## API Endpoints

### Health Check

```http
GET /ping
```

Returns worker status and version.

### Store Encrypted Document

```http
PUT /sync/{docId}
Content-Type: application/json

{
  "encrypted": "base64-encoded-encrypted-data"
}
```

### Retrieve Encrypted Document

```http
GET /sync/{docId}
```

Returns:
```json
{
  "docId": "document-id",
  "encrypted": "base64-encoded-encrypted-data",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Check Document Metadata

```http
HEAD /sync/{docId}
```

Returns headers:
- `Last-Modified`: Timestamp of last update
- Status 200 if exists, 404 if not found

## Update Client Configuration

After deploying, update the worker URL in your client app:

1. Open `v2/src/lib/stores/sync.ts`
2. Update `DEFAULT_WORKER_URL` with your deployed worker URL:

```typescript
const DEFAULT_WORKER_URL = 'https://mind-sync-worker.<your-account>.workers.dev';
```

Or users can enter a custom worker URL in the app settings.

## Security Notes

1. **Encryption**: All data is encrypted client-side before transmission
2. **HTTPS Only**: Worker should only be accessed via HTTPS in production
3. **CORS**: Limit `ALLOWED_ORIGINS` to your specific domains
4. **Rate Limiting**: Consider adding rate limiting for production use
5. **Sync URLs**: Contain encryption keys - treat as secrets

## Data Storage

- **Storage**: Cloudflare KV (key-value store)
- **Keys**: Random 32-character hex strings (document IDs)
- **Values**: JSON objects with encrypted data
- **Retention**: Indefinite (until manually deleted)

## Monitoring

Monitor your worker in the Cloudflare dashboard:
- Request count and errors
- CPU time and memory usage
- KV operation metrics

## Cost

Cloudflare Workers Free Tier includes:
- 100,000 requests/day
- 10 GB reads + 1 GB writes to KV/day
- 1 GB KV storage

This is typically sufficient for personal use.

## Troubleshooting

### CORS Errors

Ensure your domain is in the `ALLOWED_ORIGINS` array and you've redeployed.

### 404 Errors

Ensure the worker is deployed and the URL is correct.

### KV Errors

Verify KV namespace IDs in `wrangler.toml` match the created namespaces.

### Build Errors

Ensure you're using the correct versions:
- Node.js 18+ recommended
- Latest Wrangler CLI

## Development Tips

1. Use `wrangler dev` for local testing
2. Use the dev environment for testing before production deployment
3. Check Cloudflare dashboard for logs and errors
4. Use `wrangler tail` to stream real-time logs

## License

Same as parent project.
