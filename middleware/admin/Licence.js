const firebase = require('../../database/firebase');

class Licence {
    licenceRef = firebase.db.collection('licence');
    async listLicence() {
        try {
            const data = [];
            const snapshot = await this.licenceRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
        }
    }

    async updateLicence(data) {
        new Promise((resolve, reject) => {
            if(!data.id){
                this.licenceRef.doc().set({ ...data }).then(() => resolve('OK')).catch((e) => reject(e));
            }else{
                this.licenceRef.doc(data.id).update({ ...data }).then(() => resolve('OK')).catch((e) => reject(e));
            }
        })
    }
}

module.exports = { Licence }
