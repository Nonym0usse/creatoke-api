const admin = require('firebase-admin');

const verifyTokenMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    console.log(token)
    try {
        req.decodedToken = await admin.auth().verifyIdToken(token);
        next();
    } catch (error) {
        if (error.code === 'auth/id-token-revoked') {
            console.log('Le token à expiré')
        } else {
            console.log(error)
        }
        return res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = verifyTokenMiddleware;
