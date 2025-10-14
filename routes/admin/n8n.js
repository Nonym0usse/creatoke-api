// routes/upload.js (CommonJS)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

// ---- Config ----
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const BASE_PUBLIC_URL = (process.env.BASE_PUBLIC_URL || '').replace(/\/+$/, ''); // ex: https://api.creatoke.fr
const KEEP_UPLOADS = process.env.KEEP_UPLOADS === 'true'; // utile en dev
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer: disque + nom unique + filtre vidéo
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '.mp4').toLowerCase();
        const name = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, name);
    },
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Type de fichier non supporté (seules les vidéos sont acceptées)'));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 512 * 1024 * 1024 }, // 512 Mo
});

// URL publique robuste
function buildPublicUrl(req, filename) {
    if (BASE_PUBLIC_URL) {
        return `${BASE_PUBLIC_URL}/uploads/${encodeURIComponent(filename)}`;
    }
    const proto =
        (req.headers['x-forwarded-proto'] && String(req.headers['x-forwarded-proto']).split(',')[0].trim()) ||
        req.protocol ||
        'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (!host) return null;
    return `${proto}://${host.replace(/\/+$/, '')}/uploads/${encodeURIComponent(filename)}`;
}

router.post('/api/upload', upload.single('video'), async (req, res) => {
    res.status(200).send('kokookok')
});

router.post('/api/test', (req, res) => {
    res.send(200).send('OK')

});

// ✅ Middleware d’erreurs Multer (pour tailles, type, etc.)
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ status: 'error', message: 'Fichier trop volumineux' });
        }
        return res.status(400).json({ status: 'error', message: `Erreur upload: ${err.code}` });
    }
    if (err && /Type de fichier non supporté/.test(err.message)) {
        return res.status(400).json({ status: 'error', message: err.message });
    }
    return res.status(500).json({ status: 'error', message: err?.message || 'Erreur serveur' });
});

module.exports = router;