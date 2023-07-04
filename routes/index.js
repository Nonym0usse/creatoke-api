var express = require('express');
var router = express.Router();
const firebase = require('../database/firebase');
const User = require("../models/User");
const Music = require("../middleware/Music");

/* GET home page. */
router.get('/', function(req, res, next) {
  const music = new Music();
  music.getMusics()
      .then(r => r.docs.map(x => res.status(200).json(x.data())))
      .catch(e => res.status(500).json(e))
});


module.exports = router;
