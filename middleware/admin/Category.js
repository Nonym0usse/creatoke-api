const firebase = require('../../database/firebase');

class Category {
    musicRef = firebase.db.collection('sub-category');

    async getAllCategory(id) {
        try {
            const data = [];
            const snapshot = await this.musicRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            console.log(data)
            return data;
        } catch (e) {

        }
    }

    async getSubCategory(id) {
        try {
            const data = [];
            const snapshot = await this.musicRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            console.log(data)
            return data;
        } catch (e) {

        }
    }

    async getSubCategoryByID(id) {
        try {
            const data = [];
            const snapshot = await this.musicRef.where("category", "==", id.toString()).get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            console.log(data)
            return data;
        } catch (e) {

        }
    }
}

module.exports = { Category }
