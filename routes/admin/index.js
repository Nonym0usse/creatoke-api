var express = require('express');
const {MusicModel} = require("../../models/MusicModel");
const {parse} = require("querystring");
var router = express.Router();

router.post('/', async function (req, res, next) {
    const data = parse(req.body);
    const music = new MusicModel(data);

    res.json(music);

    // console.log(req.body);
    /*musicsAdmin.createMusic()
        .then(r => r.docs.map(x => res.status(200).json(x.data())))
        .catch(e => res.status(500).json(e))*/
});

module.exports = router;
