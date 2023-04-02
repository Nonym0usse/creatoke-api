const firebase = require('../database/firebase');

class Music{
    getMusics (){
        return new Promise((resolve, reject) =>{
            const MusicRef = firebase.db.collection('musics');
            MusicRef.get().then((data) => resolve(data)).catch(e => reject(e));
        })
    }
}
module.exports = Music;
