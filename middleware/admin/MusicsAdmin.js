const firebase = require('../../database/firebase');

class MusicsAdmin{
    musicRef = firebase.db.collection('musics');
    async createMusic(music){
        new Promise((resolve, reject) => {
            this.musicRef.doc().set({...music}).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async listMusics(){
        try{
            const data = [];
            const snapshot = await this.musicRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        }catch (e){

        }
    }

    async updateMusic(music, id){
        new Promise((resolve, reject) => {
            this.musicRef.doc(id).update({...music}).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async deleteMusic(id){
        new Promise((resolve, reject) => {
            this.musicRef.doc(id).delete().then(() => resolve('OK')).catch((e) => reject(e));
        })
    }
}

module.exports = {MusicsAdmin}
