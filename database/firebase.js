const admin = require('firebase-admin');
const serviceAccount = require("./creatoke-admin.json");

const firebase = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = firebase.firestore();
const storage = firebase.storage().bucket('gs://creatoke-test.appspot.com');

module.exports = {db, admin, storage};
