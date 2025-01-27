const express = require('express');
const router = express.Router();
const { Payment } = require('../../middleware/admin/Payment');
const verifyTokenMiddleware = require("../../database/auth");

const payment = new Payment();

router.post('/create', async function (req, res, next) {
    payment.createPayment(req.body).then(() => res.status(200).json({ "success": "OK" }))
        .catch((e) => res.status(400).json({error: e.message}))
});
router.get('/list-sell', verifyTokenMiddleware, async function (req, res, next) {
    payment.getPaymentFromCurrentYear().then((data) => res.status(200).json(data))
        .catch((e) => res.status(400).json({error: e.message}))
});


module.exports = router;
