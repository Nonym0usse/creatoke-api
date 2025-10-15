const axios = require('axios');

class Bluesky {
    async loginOnBlueSky() {
        try {
            const loginData = {
                identifier: process.env.BLUESKY_EMAIL,
                password: process.env.BLUESKY_PASSWORD
            }
            const blueSkyAuth = await axios.post(process.env.BLUESKY_AUTH, loginData, {
                timeout: 5 * 60 * 1000,
            });
            return blueSkyAuth.data.accessJwt;
        } catch (error) {
            throw new Error(error?.response?.data?.message || error.message || "Bluesky login failed");
        }
    }
}
module.exports = { Bluesky }
