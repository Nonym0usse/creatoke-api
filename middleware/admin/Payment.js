const firebase = require('../../database/firebase');

class Payment {
    paymentRef = firebase.db.collection('selling');

    async createPayment(data) {
        try {
            const docRef = await this.paymentRef.doc();
            await docRef.set(data);
            const docSnapshot = await docRef.get();
            if (docSnapshot.exists) {
                return { id: docSnapshot.id, ...docSnapshot.data() };
            } else {
                throw new Error('Failed to retrieve newly created payment.');
            }
        } catch (error) {
            console.error("Error creating payment:", error);
            throw error; // Re-throw the error to be handled by the caller.
        }
    }

    async getPaymentFromCurrentYear() {
        try {
            const data = [];
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const snapshot = await this.paymentRef.where('year', "==", currentYear).get();
            snapshot.docs.forEach((doc) => { // use forEach insted map
                data.push({ id: doc.id, ...doc.data() });
            });
            return data;
        } catch (error) {
            console.error("Error getting payment from current year:", error);
            throw error;
        }
    }
}

module.exports = { Payment };