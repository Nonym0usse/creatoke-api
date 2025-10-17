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
const { Bluesky } = require('../../middleware/admin/BlueSky');
const { Instagram } = require('../../middleware/admin/Instagram');

// ---- Config ----
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const BASE_PUBLIC_URL = (process.env.BASE_PUBLIC_URL || '').replace(/\/+$/, ''); // ex: https://api.creatoke.fr
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

function truncateText(text, max = 280) {
    if (!text) return '';
    // découpe Unicode-safe
    return Array.from(text).slice(0, max).join('');
}

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
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'Aucun fichier fourni' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    const publicUrl = buildPublicUrl(req, fileName);
    const title = (req.body && req.body.title) || '';
    const description = truncateText(req.body?.description, 280);

    if (!publicUrl) {
        // Instagram exige une URL publique accessible
        return res.status(500).json({
            status: 'error',
            message: 'BASE_PUBLIC_URL manquant ou impossible de construire l’URL publique.',
        });
    }

    let igPublished = false;

    try {
        // FormData binaire → n8n
        const blueSky = new Bluesky();
        const ig = new Instagram();
        const formData = new FormData();

        const getBlueSkyAuth = await blueSky.loginOnBlueSky();
        await ig.publishReel(description, publicUrl);
        igPublished = true;

        formData.append('video', fs.createReadStream(filePath), {
            filename: req.file.originalname || fileName,
            contentType: req.file.mimetype || 'video/mp4',
        });
        formData.append('title', title);
        formData.append('description', description);
        formData.append('blueSkyJwt', getBlueSkyAuth);
        formData.append('videoUrl', publicUrl)

        const n8nResponse = await axios.post(process.env.N8N_WEBHOOK_URL, formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 5 * 60 * 1000,
        });

        return res.status(n8nResponse.status).json({
            status: 'ok',
            file: fileName,
            videoUrl: publicUrl || null,
            n8n: n8nResponse.data,
        });
    } catch (error) {
        const status = error?.response?.status || 500;
        return res.status(status).json({
            status: 'error',
            message: error?.response?.data || error.message || 'Échec envoi n8n',
        });
    } finally {
        fsp.unlink(filePath).catch((e) => console.error('Suppression fichier échouée :', e));
    }
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