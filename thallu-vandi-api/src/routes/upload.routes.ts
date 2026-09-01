import { Router, Request, Response } from 'express';
import multer from 'multer';
import { verifyToken } from '../../../auth/src/middleware/verifyToken';
import { uploadToAzure, getBlobUrl, generateUniqueId, extensionFromMimetype } from '../config/storage';

const upload = multer();
const router = Router();

// No "thallu-vandi/" prefix needed anymore — the dedicated container is the namespace.
const VALID_FOLDERS = ['stall-photos', 'menu-photos'];

router.use(verifyToken);

router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const { folder } = req.body;
  if (!folder || !VALID_FOLDERS.includes(folder)) {
    return res.status(400).json({ success: false, error: `Invalid folder. Must be one of: ${VALID_FOLDERS.join(', ')}` });
  }

  try {
    const key = `${folder}/${generateUniqueId()}.${extensionFromMimetype(req.file.mimetype)}`;
    await uploadToAzure(key, req.file.buffer, req.file.mimetype);
    res.json({ success: true, key, url: getBlobUrl(key), folder });
  } catch (err) {
    console.error('[thallu-vandi upload] failed', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

router.post('/image-base64', async (req: Request, res: Response) => {
  const { image, mimetype, folder } = req.body;

  if (!image) {
    return res.status(400).json({ success: false, error: 'No image data provided' });
  }
  if (!folder || !VALID_FOLDERS.includes(folder)) {
    return res.status(400).json({ success: false, error: `Invalid folder. Must be one of: ${VALID_FOLDERS.join(', ')}` });
  }

  const imageBuffer = Buffer.from(image, 'base64');
  if (imageBuffer.length / (1024 * 1024) > 10) {
    return res.status(400).json({ success: false, error: 'Image size must be less than 10MB' });
  }

  try {
    const key = `${folder}/${generateUniqueId()}.${extensionFromMimetype(mimetype || 'image/jpeg')}`;
    await uploadToAzure(key, imageBuffer, mimetype || 'image/jpeg');
    res.json({ success: true, key, url: getBlobUrl(key), folder });
  } catch (err) {
    console.error('[thallu-vandi upload] failed', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

export default router;
