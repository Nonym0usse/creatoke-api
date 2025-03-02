const express = require('express');
const router = express.Router();
const { Payment } = require('../../middleware/admin/Payment');
const verifyTokenMiddleware = require("../../database/auth");

const payment = new Payment();

router.post('/create', async function (req, res, next) {
    try {
        const createPayment = await payment.createPayment(req.body);
        if (createPayment) {
            res.status(200).json({ "songUrlDownload": createPayment.songUrlDownload });
        } else {
            throw Error("Payment creation failed.")
        }

    } catch (error) {
        console.error("Error creating payment:", error);
        res.status(400).json({ error: error.message || "Payment creation failed" });
    }
});
router.get('/list-sell', verifyTokenMiddleware, async function (req, res, next) {
    payment.getPaymentFromCurrentYear().then((data) => res.status(200).json(data))
        .catch((e) => res.status(400).json({ error: e.message }))
});


module.exports = router;
