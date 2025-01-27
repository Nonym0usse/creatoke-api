const firebase = require('../../database/firebase');
class Comment {
    commentRef = firebase.db.collection('comment');

    async createComment(data) {
        new Promise((resolve, reject) => {
            this.commentRef.doc().set(data).then(() => resolve('OK'))
        })
    }
    async getAllComments() {
        try {
            const data = [];
            const snapshot = await this.commentRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
        }
    }
    async getComments(id){
        try {
            const data = [];
            const snapshot = await this.commentRef.where('music_id', "==", id).get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
        }
    }

    async deleteComment(id) {
        new Promise((resolve, reject) => {
            this.commentRef.doc(id).delete().then(() => resolve('OK')).catch((e) => reject(e));
        })
    }
}

module.exports = { Comment }
