const firebase = require('../../database/firebase');
const {reject} = require("nodemailer/.ncurc");
const {resolve} = require("@babel/core/lib/vendor/import-meta-resolve");

class Category {
    categoryRef = firebase.db.collection('category');
    bucket = firebase.admin.storage().bucket();
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

    async deleteCategory(data) {
        new Promise((resolve, reject) => {
            this.categoryRef.doc(data.id).delete().then(() => this.getAllCategory().then(data => resolve(data)).catch((e) => console.log(e)))
            this.bucket.file(`category/${data.picture}`).delete();
        })
    }

    async createCategory(music) {
        new Promise((resolve, reject) => {
            console.log(music)
            this.categoryRef.doc().set({ ...music }).then(() => resolve('OK')).catch((e) => reject(e));
        })
    }

    async createBackground(data) {
        new Promise((resolve, reject) => {
            this.getBackgroundImg().then((background) => {
                background.forEach((backgroundId) => {
                    if(backgroundId.id){
                        firebase.db.collection('background').doc(backgroundId.id).delete();
                        this.bucket.file(`background/${backgroundId.picture_name}`).delete();
                    }
                })
            }).then(() => firebase.db.collection('background').doc().set({picture: data?.picture, picture_name: data?.picture_name})).finally(() => resolve('OK'))
        })
    }

    async modifyText(text) {
        new Promise((resolve, reject) => {
            if(text.id === undefined || text.id === ''){
                firebase.db.collection('texts').doc().set(text).then(() => resolve('OK')).catch((e) => reject(e));
            }else{
                firebase.db.collection('texts').doc(text.id).update(text).then(() => resolve('OK')).catch((e) => reject(e));
            }
        })
    }

    async getBackgroundImg() {
        try {
            const data = [];
            const snapshot = await firebase.db.collection('background').get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }

    async getTexts() {
        try {
            const data = [];
            const snapshot = await firebase.db.collection('texts').get();
            snapshot.docs.map(function (map) {
                data.push({ id: map.id, ...map.data() })
            })
            return data;
        } catch (e) {

        }
    }
}

module.exports = { Category }
