const admin = require('firebase-admin');
const serviceAccount = require("./creatoke-admin.json");

const firebase = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "gs://creatoke-a8611.appspot.com"
});

const db = firebase.firestore();

module.exports = {db, admin};
