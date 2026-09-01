import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'crypto';

let blobServiceClient: BlobServiceClient | null = null;

function getClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING must be set in .env');
    blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  }
  return blobServiceClient;
}

// Own dedicated container (auto-created on first upload via createIfNotExists)
// so Thallu Vandi's blobs don't sit inside the shared "ansora" container with
// other products' files — same Azure account/connection string though.
const getContainerName = () => process.env.THALLUVANDI_STORAGE_CONTAINER || 'thalluvandi';
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
  // access: 'blob' — anonymous read of individual blobs (not container listing).
  // A brand-new container defaults to private, which 404s for the app's plain
  // <Image> GETs — this makes the container work the same way "ansora" already does.
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
