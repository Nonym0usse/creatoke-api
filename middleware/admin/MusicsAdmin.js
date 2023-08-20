const firebase = require('../../database/firebase');
const connectionSchema = require("../../models/musicSchema");

class MusicsAdmin {
    musicRef = firebase.db.collection('musics');

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

    async listMusics() {
        try {
            const data = [];
            const snapshot = await this.musicRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            throw new Error("ERROR_SERVER");
        }
    }

    async singleMusic(id) {
        try {
            const snapshot = await this.musicRef.doc(id).get();
            const musicData = snapshot.data();
            musicData.id = snapshot.id;
            return musicData;
        } catch (e) {
            console.log(e)
        }
    }

    async updateMusic(music, id) {
        new Promise((resolve, reject) => {
            this.musicRef.doc(id).update({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async deleteMusic(id) {
        console.log(id)
        new Promise((resolve, reject) => {
            this.musicRef.doc(id).delete().then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async highlightMusic() {
        try {
            const data = [];
            //const snapshot = await this.musicRef.orderBy('created_at').get();
            const snapshot = await this.musicRef.get();

            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            throw Error(e);
        }
    }

    async getSongByCategory(params) {
        try {
            const data = [];
            const snapshot = await this.musicRef.where("category", "==", params?.category.toString()).where("subcategory", "==", params?.subcategory.toString()).get()
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }

    async searchRecommandSongs(limit) {
        try {
            const data = [];
            const snapshot = await this.musicRef.limit(parseInt(limit)).get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            console.log(e)
        }
    }
}

module.exports = { MusicsAdmin }
