const admin = require('firebase-admin');

const verifyTokenMiddleware = async (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1]; // Expecting "Bearer <token>"
    if (!token || token === 'null') {
        return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(401).json({ message: 'Token verification failed, authorization denied' });
    }
};

module.exports = verifyTokenMiddleware;
