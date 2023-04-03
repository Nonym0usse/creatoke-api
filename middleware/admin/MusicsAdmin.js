const firebase = require('../../database/firebase');

class MusicsAdmin{
    musicRef = firebase.db.collection('musics');
    async createMusic(music){
        let musicData;
       try{
           musicData = await this.musicRef.doc(music.title).set(music);
       }catch (e){
            musicData = "Something wrong happen for getting data...";
       }
       return musicData;
    }
}

module.exports = {MusicsAdmin}
