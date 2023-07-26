const firebase = require('../../database/firebase');
const {Contact} = require("./Contact");
class Payment {
    paymentRef = firebase.db.collection('selling');

    async createPayment(data) {
        new Promise((resolve, reject) => {
            const contact = new Contact();
            const payment = {};
            if(data.premium === true){
                payment.price_pro = data.premium;
            }else if(data.basic === true){
                payment.price_base_plus = data.basic;
            }else if(data.regular === true){
                payment.price_base = data.regular;
            }
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');

            payment.created_at = `${day}-${month}-${year} ${hours}:${minutes}`;
            payment.music_id = data.id;
            contact.sendEmail()
            //this.paymentRef.doc().set({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }
}

module.exports = { Payment }
