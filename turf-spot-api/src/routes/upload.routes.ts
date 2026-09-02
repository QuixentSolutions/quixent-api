import { Router, Request, Response } from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/verifyToken';
import { uploadToAzure, getBlobUrl, generateUniqueId, extensionFromMimetype } from '../config/storage';

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

const VALID_FOLDERS = ['turf-photos', 'menu-photos'];

router.use(verifyToken);

router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const { folder } = req.body;
  if (!folder || !VALID_FOLDERS.includes(folder)) {
    return res.status(400).json({ success: false, error: `Invalid folder. One of: ${VALID_FOLDERS.join(', ')}` });
  }

  try {
    const key = `${folder}/${generateUniqueId()}.${extensionFromMimetype(req.file.mimetype)}`;
    await uploadToAzure(key, req.file.buffer, req.file.mimetype);
    res.json({ success: true, key, url: getBlobUrl(key), folder });
  } catch (err) {
    console.error('[turf-spot upload] failed', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

router.post('/image-base64', async (req: Request, res: Response) => {
  const { image, mimetype, folder } = req.body;
  if (!image) return res.status(400).json({ success: false, error: 'No image data provided' });
  if (!folder || !VALID_FOLDERS.includes(folder)) {
    return res.status(400).json({ success: false, error: `Invalid folder. One of: ${VALID_FOLDERS.join(', ')}` });
  }

  const buffer = Buffer.from(image, 'base64');
  if (buffer.length / (1024 * 1024) > 10) {
    return res.status(400).json({ success: false, error: 'Image must be under 10MB' });
  }

  try {
    const key = `${folder}/${generateUniqueId()}.${extensionFromMimetype(mimetype || 'image/jpeg')}`;
    await uploadToAzure(key, buffer, mimetype || 'image/jpeg');
    res.json({ success: true, key, url: getBlobUrl(key), folder });
  } catch (err) {
    console.error('[turf-spot upload] failed', err instanceof Error ? err.message : err);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

export default router;
