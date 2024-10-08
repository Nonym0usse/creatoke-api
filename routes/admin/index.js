const express = require('express');
const {MusicModel} = require("../../models/MusicModel");
const {MusicsAdmin} = require("../../middleware/admin/MusicsAdmin");
const router = express.Router();
const verifyTokenMiddleware = require('../../database/auth');

const musicsAdmin = new MusicsAdmin();

router.post('/create-music', verifyTokenMiddleware, async function (req, res, next) {
    musicsAdmin.createMusic(req.body).then(() => res.status(200).json({"success": "OK"}))
    .catch((e) => res.status(400).send(e))
});

router.get('/list-music', async function (req, res, next) {
    try {
        const musics = await musicsAdmin.listMusics()
        res.status(200).json(musics);
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/single-music/:id', async function (req, res, next) {
    try {
        await musicsAdmin.singleMusic(req.params.id).then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error);
    }
});

router.put('/update-music', verifyTokenMiddleware, async function (req, res, next) {
    try {
        musicsAdmin.updateMusic(req.body).then(() => res.status(200).json({"success": "OK"}))
            .catch((e) => res.status(400).send(e))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.delete('/delete-music/:id', verifyTokenMiddleware, async function (req, res, next) {
    try {
        musicsAdmin.deleteMusic(req.params.id).then(() => res.status(200).json({"success": "OK"}))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/highlight-music', async function (req, res, next) {
    try {
        musicsAdmin.highlightMusic().then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.post('/getSongByCategory/', async function (req, res, next) {
    try {
        musicsAdmin.getSongByCategory(req.body).then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/preview-searching/:limit', async function (req, res, next) {
    try {
        musicsAdmin.searchRecommandSongs(req.params.limit).then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/searching/:term', async function (req, res, next) {
    try {
        musicsAdmin.search(req.params.term).then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});
module.exports = router;
