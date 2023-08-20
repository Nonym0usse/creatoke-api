const express = require('express');
const {admin} = require("../../database/firebase");
const router = express.Router();

router.post('/refresh-token', async (req, res) => {
    try {
        const newIdToken = await admin.auth().createCustomToken(req.user.uid);
        res.json({ idToken: newIdToken });
    } catch (error) {
        res.status(500).json({ error: 'Token refresh failed' });
    }
});
module.exports = router;
