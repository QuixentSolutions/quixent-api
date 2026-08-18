import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'crypto';

let blobServiceClient: BlobServiceClient | null = null;

function getAzureClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING must be set in .env');
    blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  }
  return blobServiceClient;
}

const getContainerName = () => process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads';

const mimeToExt: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp',
};

export async function uploadToS3(base64: string, mimetype: string, folder: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Image must be under 5MB');

  const ext = mimeToExt[mimetype.toLowerCase()] ?? 'jpg';
  const key = `${folder}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

  const containerClient = getAzureClient().getContainerClient(getContainerName());
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(key);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: mimetype },
  });

  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME || '';
  return `https://${account}.blob.core.windows.net/${getContainerName()}/${key}`;
}
