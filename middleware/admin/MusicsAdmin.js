const firebase = require('../../database/firebase');

class MusicsAdmin {
    musicRef = firebase.db.collection('musics');
    bucket = firebase.admin.storage().bucket();

    async createMusic(music) {
        new Promise((resolve, reject) => {
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
            return e;
        }
    }

    async singleMusic(id) {
        try {
            const snapshot = await this.musicRef.doc(id).get();
            const musicData = snapshot.data();
            musicData.id = snapshot.id;
            return musicData;
        } catch (e) {
            return e;
        }
    }

    async updateMusic(music) {
        new Promise((resolve, reject) => {
            this.musicRef.doc(music.id).update({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async deleteMusic(id) {
        try {
            const snapshot = await this.musicRef.doc(id).get();
            const musicData = snapshot.data();
            const nameFields = Object.keys(musicData).filter(key => key.endsWith('_name'));
            const nameFieldValues = nameFields.map(key => musicData[key]);
            if (nameFields.length > 0 || nameFieldValues.length > 0) {
                nameFieldValues.forEach((field) => {
                    if (field !== "" || field !== null) {
                        this.bucket.file(`songs/${field}`).delete();
                    }
                });
            }
            this.musicRef.doc(id).delete().then(() => { return "ok" });
        } catch (e) {
            return e;
        }
    }

    async highlightMusic() {
        try {
            const data = [];
            //const snapshot = await this.musicRef.orderBy('created_at').get();
            const snapshot = await this.musicRef
                .where("isHeartStroke", "==", "oui")
                .orderBy("created_at", "desc")
                .get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
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
            return e;
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
            return e;
        }
    }

    async search(searchTerm) {
        try {
            const data = [];
            //const snapshot = await this.musicRef.orderBy('created_at').get();
            const snapshot = await this.musicRef.where('title', '>=', searchTerm)
                .where('title', '<=', searchTerm + '\uf8ff').get()
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
        }
    }
}

module.exports = { MusicsAdmin }
