import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'crypto';

// Azure Blob, same account/connection string the other modules use, but
// TurfSpot's own container so its blobs sit in a separate namespace.
let blobServiceClient: BlobServiceClient | null = null;

function getClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING must be set in .env');
    blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  }
  return blobServiceClient;
}

const getContainerName = () => process.env.TURFSPOT_STORAGE_CONTAINER || 'turfspot';
const getAccountName = () => process.env.AZURE_STORAGE_ACCOUNT_NAME || 'quixent';

export function generateUniqueId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function getBlobUrl(key: string): string {
  if (!key) return '';
  if (key.startsWith('http')) return key;
  return `https://${getAccountName()}.blob.core.windows.net/${getContainerName()}/${key}`;
}

export async function uploadToAzure(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const containerClient = getClient().getContainerClient(getContainerName());
  // access: 'blob' — anonymous read of individual blobs so the apps' plain
  // <Image> GETs work without SAS tokens (same as the other modules).
  await containerClient.createIfNotExists({ access: 'blob' });
  const blockBlobClient = containerClient.getBlockBlobClient(key);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function extensionFromMimetype(mimetype: string): string {
  return MIME_TO_EXT[mimetype?.toLowerCase()] || 'jpg';
}
