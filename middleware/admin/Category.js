const firebase = require('../../database/firebase');
const {reject} = require("nodemailer/.ncurc");
const {resolve} = require("@babel/core/lib/vendor/import-meta-resolve");

class Category {
    categoryRef = firebase.db.collection('category');

    async getAllCategory() {
        try {
            const data = [];
            const snapshot = await this.categoryRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }

    async getSubCategory(id) {
        try {
            const data = [];
            const snapshot = await this.categoryRef.get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }

    async getSubCategoryByID(id) {
        try {
            const data = [];
            const snapshot = await this.categoryRef.where("category", "==", id.toString()).get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }

    async deleteCategory(id) {
        new Promise((resolve, reject) => {
            this.categoryRef.doc(id).delete().then(() => this.getAllCategory().then(data => console.log(data)).catch((e) => console.log(e)))
        })
    }

    async createCategory(music) {
        new Promise((resolve, reject) => {
            console.log(music)
            this.categoryRef.doc().set({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }
}

module.exports = { Category }
