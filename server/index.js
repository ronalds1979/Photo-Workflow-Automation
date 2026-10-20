import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { isValidRetailBarcode, recognizeBarcode } from './ocr.js';
import apiRoutes from './routes/api.js';
import { prisma, seedGenres } from './services/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

process.env.DATABASE_URL ??= `file:${path.join(projectRoot, 'film_catalog.db')}`;

const app = express();
const port = Number(process.env.PORT || 3000);
const uploadsDir = path.join(projectRoot, 'uploads');
const distDir = path.join(projectRoot, 'dist');

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }
    callback(new Error('Only image files are allowed for cover uploads.'));
  },
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(uploadsDir));

app.use('/api', apiRoutes);

app.post('/api/upload-cover', upload.single('image'), async (req, res) => {
  const slot = String(req.body.slot || '');
  if (!req.file || !['front', 'back'].includes(slot)) {
    res.status(400).json({ success: false, message: 'A cover image and a front/back slot are required.' });
    return;
  }

  const normalizedFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const normalizedPath = path.join(uploadsDir, normalizedFilename);
  try {
    const metadata = await sharp(req.file.buffer, { failOn: 'error' }).metadata();
    if (metadata.format === 'jpeg' && (!metadata.orientation || metadata.orientation === 1)) {
      await fs.promises.writeFile(normalizedPath, req.file.buffer);
    } else {
      await sharp(req.file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
        .toFile(normalizedPath);
    }

    res.status(201).json({
      success: true,
      file: {
        slot,
        filename: normalizedFilename,
        path: `/uploads/${normalizedFilename}`,
      },
    });
  } catch (error) {
    await fs.promises.unlink(normalizedPath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Failed to remove incomplete normalized cover', cleanupError instanceof Error ? cleanupError.name : 'Unknown error');
      }
    });
    console.error('Cover image normalization failed', error instanceof Error ? error.message : 'Unknown error');
    res.status(415).json({
      success: false,
      message: `The ${slot} camera photo could not be prepared as a standard image. Choose a JPEG photo or change the camera setting to JPEG/Most Compatible and capture it again.`,
    });
  }
});

app.post('/api/barcode/read', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Choose or capture an image containing a barcode.' });
    return;
  }

  try {
    const scan = await recognizeBarcode(req.file.buffer);
    if (!scan.barcode) {
      res.json({
        success: true,
        found: false,
        message: 'No supported barcode was read. Try a close, sharp photo of the barcode, or enter its digits manually.',
      });
      return;
    }

    res.json({
      success: true,
      found: true,
      barcode: scan.barcode,
      format: scan.barcodeFormat,
      source: scan.barcodeSource,
      validated: isValidRetailBarcode(scan.barcode),
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    const diagnostic = error instanceof Error
      ? { name: error.name, code: error.code || null, message: error.message }
      : { name: 'UnknownError', code: null, message: String(error) };
    console.error('Barcode read failed', { requestId, ...diagnostic });
    res.status(500).json({
      success: false,
      requestId,
      message: `Barcode processing failed (${diagnostic.name}${diagnostic.code ? `/${diagnostic.code}` : ''}). Try another image or enter the barcode manually. If it repeats, report reference ${requestId}.`,
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed', error);
  const status = error instanceof multer.MulterError ? 400 : 415;
  res.status(status).json({ success: false, message: error.message || 'The request could not be processed.' });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }

  if (fs.existsSync(distDir) && fs.existsSync(path.join(distDir, 'index.html'))) {
    res.sendFile(path.join(distDir, 'index.html'));
    return;
  }

  res.send('Film collection backend is running. Build the frontend before serving static assets.');
});

async function cleanUploads() {
  try {
    const files = await fs.promises.readdir(uploadsDir);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      if (file.endsWith('.jpg') || file.endsWith('.png')) {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.promises.stat(filePath);

        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          const isReferenced = await prisma.edition.findFirst({
            where: {
              OR: [
                { frontCoverPath: `/uploads/${file}` },
                { backCoverPath: `/uploads/${file}` },
                { spineImagePath: `/uploads/${file}` }
              ]
            }
          });

          if (!isReferenced) {
            await fs.promises.unlink(filePath);
            cleaned++;
          }
        }
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} orphaned upload files.`);
    }
  } catch (error) {
    console.error('Failed to clean uploads directory:', error);
  }
}

async function start() {
  await prisma.$connect();
  await seedGenres();

  await cleanUploads();
  setInterval(cleanUploads, 24 * 60 * 60 * 1000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Film collection API listening on http://0.0.0.0:${port}`);
  });
}

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start the film collection API.', error);
    process.exit(1);
  });
}
