const express = require('express');
const router = express.Router();
const { Contact } = require('../../middleware/admin/Contact');

const contact = new Contact();

router.post('/send-email', async function (req, res, next) {
    contact.sendEmail(req.body).then(() => res.status(200).json({"success": "OK"}))
    .catch((e) => res.status(400).send(e))
});

module.exports = router;
