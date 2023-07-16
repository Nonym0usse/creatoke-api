const firebase = require('../../database/firebase');
const connectionSchema = require("../../models/musicSchema");

class Formule {
    musicRef = firebase.db.collection('formule');

    async createMusic(music) {
        new Promise((resolve, reject) => {
            try {
                connectionSchema.validateAsync(music);
            } catch (error) {
                reject("INVALID_PARAMS");
            }
            this.musicRef.doc().set({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }
}

module.exports = { Formule }