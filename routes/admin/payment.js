const express = require('express');
const router = express.Router();
const { Payment } = require('../../middleware/admin/Payment');

const payment = new Payment();

router.post('/create', async function (req, res, next) {
    payment.createPayment(req.body).then(() => res.status(200).json({"success": "OK"}))
        .catch((e) => res.status(400).send(e))
});

module.exports = router;
