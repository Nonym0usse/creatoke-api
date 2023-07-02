const express = require('express');
const {MusicModel} = require("../../models/MusicModel");
const {MusicsAdmin} = require("../../middleware/admin/MusicsAdmin");
const router = express.Router();

const musicsAdmin = new MusicsAdmin();

router.post('/create-music', async function (req, res, next) {
    console.log(req.body)
    musicsAdmin.createMusic(req.body).then(() => res.status(200).json({"success": "OK"}))
    .catch((e) => res.status(400).send(e))
});

router.get('/list-music', async function (req, res, next) {
    const music = new MusicModel(req.body);
    try {
        const musics = await musicsAdmin.listMusics()
        res.status(200).json(musics);
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.put('/update-music', async function (req, res, next) {
    const music = new MusicModel(req.body);
    try {
        const error = await music.validate();
        if(!error){
            musicsAdmin.updateMusic(music, req.query.id).then(() => res.status(200).json({"success": "OK"}))
                .catch((e) => res.status(400).send(e))
        }else{
            res.status(400).json(error);
        }
    } catch (error) {
        res.status(400).json(error.message);
    }
});


router.delete('/delete-music', async function (req, res, next) {
    try {
        musicsAdmin.deleteMusic(req.query.id).then(() => res.status(200).json({"success": "OK"}))
    } catch (error) {
        res.status(400).json(error.message);
    }
});
module.exports = router;
