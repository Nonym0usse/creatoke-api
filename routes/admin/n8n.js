const express = require('express');
const router = express.Router();
const multerModule = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const upload = multerModule({ dest: "uploads/" });

router.post("/api/upload", upload.single("video"), async (req, res) => {

    if (!req.file) {
        return res.status(400).json({ status: "error", message: "Aucun fichier fourni" });
    }

    const filePath = req.file.path;

    try {
        const fileStream = fs.createReadStream(filePath);

        // Préparer le form-data pour l'envoi à n8n
        const formData = new FormData({ maxDataSize: 20 * 1024 * 1024 }); // 20 Mo
        formData.append("video", fileStream, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });
        formData.append("description", req.body.description);
        formData.append("title", req.body.title);
        // Envoyer la vidéo à n8n
        const n8nResponse = await axios.post(
            "https://n8n.creatoke.fr/webhook/dd07341f-2d1b-4621-8795-810a832f1473",
            formData,
            {
                headers: formData.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 5 * 60 * 1000
            }
        );

        // Supprimer le fichier temporaire après succès
        fs.unlink(filePath, (err) => {
            if (err) console.error("Erreur suppression fichier :", err);
        });

        return res.status(n8nResponse.status).json({
            status: n8nResponse.status,
            n8nResponse: n8nResponse.statusText,
        });

    } catch (error) {
        console.error("Erreur upload :", error);

        // Supprimer le fichier même si une erreur survient
        fs.unlink(filePath, (err) => {
            if (err) console.error("Erreur suppression fichier :", err);
        });

        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

module.exports = router;