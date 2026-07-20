import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { asyncHandler, HttpError } from '../../utils/http';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../utils/permissions';
import { auditLog } from '../../utils/audit';
import { BRANDING_KEYS, getBranding, setSetting } from '../../utils/settings';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new HttpError(400, 'Ungültiger Dateityp (nur PNG, JPEG, WEBP, SVG, ICO)'));
      return;
    }
    cb(null, true);
  },
});

// GET /branding – öffentliche Branding-Werte
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getBranding());
  }),
);

// GET /branding/manifest.json – dynamisch generiertes PWA-Manifest
router.get(
  '/manifest.json',
  asyncHandler(async (_req, res) => {
    const b = await getBranding();
    const icon = b.faviconUrl || b.logoUrl || '/icons/icon-512.png';
    res.json({
      name: b.appName,
      short_name: b.appName,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: b.primaryColor,
      icons: [
        { src: icon, sizes: '192x192', type: 'image/png' },
        { src: icon, sizes: '512x512', type: 'image/png' },
      ],
    });
  }),
);

router.use(authenticate);

// PUT /branding – Branding-Werte setzen
router.put(
  '/',
  requirePermission('canManageBranding'),
  asyncHandler(async (req, res) => {
    const updated: string[] = [];
    for (const key of BRANDING_KEYS) {
      if (key in req.body) {
        await setSetting(key, String(req.body[key] ?? ''));
        updated.push(key);
      }
    }
    await auditLog('UPDATE_BRANDING', req.user!.id, null, 'branding', { keys: updated });
    res.json(await getBranding());
  }),
);

// POST /branding/logo – Logo-Upload
router.post(
  '/logo',
  requirePermission('canManageBranding'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Keine Datei hochgeladen');
    const url = `/uploads/${req.file.filename}`;
    await setSetting('logoUrl', url);
    await auditLog('UPDATE_BRANDING', req.user!.id, null, 'branding', { logoUrl: url });
    res.status(201).json({ logoUrl: url });
  }),
);

// POST /branding/favicon – Favicon-Upload
router.post(
  '/favicon',
  requirePermission('canManageBranding'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Keine Datei hochgeladen');
    const url = `/uploads/${req.file.filename}`;
    await setSetting('faviconUrl', url);
    await auditLog('UPDATE_BRANDING', req.user!.id, null, 'branding', { faviconUrl: url });
    res.status(201).json({ faviconUrl: url });
  }),
);

export default router;
