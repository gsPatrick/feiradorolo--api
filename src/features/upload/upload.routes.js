'use strict';

/**
 * Upload de imagens (banners, avatares, produtos). Salva em /public/uploads e
 * serve estático em /uploads. Retorna a URL absoluta. Montado em /uploads.
 */
const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../../middlewares/auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens (PNG, JPG, WEBP, GIF, SVG).'));
  },
});

const router = Router();

router.post('/', auth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Nenhum arquivo enviado.' } });
    }
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.status(201).json({ success: true, data: { url, filename: req.file.filename } });
  });
});

module.exports = router;
