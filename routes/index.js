var express = require('express');
var router = express.Router();
const firebase = require('../database/firebase');
const User = require("../models/User");
const Music = require("../middleware/Music");

/* GET home page. */
router.get('/', function (req, res, next) {
  const music = new Music();
  music.getMusics()
    .then(r => r.docs.map(x => res.status(200).json(x.data())))
    .catch(e => res.status(500).json(e))
});

router.post('/download', async (req, res) => {
  try {
    const songUrl = req.body.songUrl;
    const songName = req.body.songName || 'song';

    if (!songUrl) {
      return res.status(400).json({ error: 'Missing songUrl parameter' });
    }

    const response = await fetch(songUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type');

    const data = await response.arrayBuffer();
    const buffer = Buffer.from(data);
    console.log(contentType)
    let fileExtension = '.mp3'; // Default to MP3
    if (contentType.includes('wav')) {
      fileExtension = '.wav';
    } else if (contentType.includes('ogg')) {
      fileExtension = '.ogg';
    } else if (contentType.includes('aac')) {
      fileExtension = '.aac';
    }

    const safeFilename = encodeURIComponent(songName.replace(/[^a-zA-Z0-9-_]/g, '_')) + fileExtension;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    res.send(buffer);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error });
  }
});

module.exports = router;
