import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'crypto';

// File was empty before this fix — uploadProfileImageService (auth.service.ts)
// imports uploadToS3 from here and would crash on any profile-image upload.
// Despite the "S3" name (kept for import-site compatibility), storage is
// Azure Blob, using the AZURE_STORAGE_* vars already in .env.

let blobServiceClient: BlobServiceClient | null = null;

function getClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING must be set in .env');
    blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  }
  return blobServiceClient;
}

const getContainerName = () => process.env.AZURE_STORAGE_CONTAINER_NAME || 'ansora';
const getAccountName = () => process.env.AZURE_STORAGE_ACCOUNT_NAME || 'quixent';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function extensionFromMimetype(mimetype: string): string {
  return MIME_TO_EXT[(mimetype || '').toLowerCase()] || 'jpg';
}

function getBlobUrl(key: string): string {
  return `https://${getAccountName()}.blob.core.windows.net/${getContainerName()}/${key}`;
}

// Signature matches the existing call site in auth.service.ts:
// uploadToS3(base64, mimetype, 'Profile-images') -> full public URL
export async function uploadToS3(base64: string, mimetype: string, folder: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const key = `${folder}/${crypto.randomBytes(16).toString('hex')}.${extensionFromMimetype(mimetype)}`;

  const containerClient = getClient().getContainerClient(getContainerName());
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(key);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: mimetype || 'image/jpeg' },
  });

  return getBlobUrl(key);
}
