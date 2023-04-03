var express = require('express');
const {MusicModel} = require("../../models/MusicModel");
const {parse} = require("querystring");
const {plainToClass} = require("class-transformer");
const {validate} = require("class-validator");
var router = express.Router();

router.post('/', async function (req, res, next) {
    const music = new MusicModel(req.body);
    try {
        console.log(req.body)
        music.validate();
        // save music to database or do other actions
        res.status(200).send('Music saved successfully');
    } catch (error) {
        console.log(error)
        res.status(400).send(error.message);
    }

    // console.log(req.body);
    /*musicsAdmin.createMusic()
        .then(r => r.docs.map(x => res.status(200).json(x.data())))
        .catch(e => res.status(500).json(e))*/
});

module.exports = router;
