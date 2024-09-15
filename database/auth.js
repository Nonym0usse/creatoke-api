const admin = require('firebase-admin');

const verifyTokenMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    try {
        req.decodedToken = await admin.auth().verifyIdToken(token);
        next();
    } catch (error) {
        if (error.code === 'auth/id-token-expired') {
            console.log('Firebase ID token has expired:', error);
            return res.status(401).json({ message: 'Firebase ID token has expired' });
        } else if (error.code === 'auth/id-token-revoked') {
            console.log('Firebase ID token has been revoked:', error);
            return res.status(401).json({ message: 'Firebase ID token has been revoked' });
        } else {
            console.error('Error verifying Firebase ID token:', error);
            return res.status(500).json({ message: 'Failed to verify token' });
        }
    }
};

module.exports = verifyTokenMiddleware;