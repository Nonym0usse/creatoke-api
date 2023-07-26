const express = require('express');
const router = express.Router();
const { Licence } = require('../../middleware/admin/Licence');

const licence = new Licence();

router.put('/update', async function (req, res, next) {
    licence.updateLicence(req.body).then(() => res.status(200).json({"success": "OK"}))
        .catch((e) => res.status(400).send(e))
});

router.get('/list-licence', async function (req, res, next) {
    try {
        licence.listLicence().then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});
module.exports = router;
