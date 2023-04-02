const firebase = require('../../database/firebase');

class MusicsAdmin{
    musicRef = firebase.db.collection('musics');
    createMusic(){
        this.musicRef.doc()
    }
}

module.exports = {MusicsAdmin}
