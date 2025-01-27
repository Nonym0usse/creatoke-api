const firebase = require('../../database/firebase');
const {Contact} = require("./Contact");

class Payment {

    paymentRef = firebase.db.collection('selling');

    async createPayment(data) {
        new Promise((resolve, reject) => {
            const contact = new Contact();
            this.paymentRef.doc().set(data).then(() => {
                contact.sendEmailPayment(data).then((resp) => {
                    resolve(resp);
                });
            }).catch((e) => reject(e));
        })
    }
    async getPaymentFromCurrentYear(){
        try {
            const data = [];
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const snapshot = await this.paymentRef.where('year', "==", currentYear).get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {
            return e;
        }
    }
}

module.exports = { Payment }
