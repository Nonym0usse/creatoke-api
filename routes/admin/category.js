const express = require('express');
const { Category } = require('../../middleware/admin/Category');
const router = express.Router();

//const contact = new Contact();
const category = new Category();

router.get('/getAllCategory', async function (req, res, next) {
    try {
        const categories = await category.getAllCategory()
        res.status(200).json(categories);
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/getSubCategory', async function (req, res, next) {
    try {
        const categories = await category.getSubCategory()
        res.status(200).json(categories);
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.get('/getSubCategoryByID/:id', async function (req, res, next) {
    try {
        const categories = await category.getSubCategoryByID(req.params.id)
        res.status(200).json(categories);
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.delete('/delete/:id', async function (req, res, next) {
    try {
        await category.deleteCategory(req.params.id).then((data) => res.status(200).json(data))
    } catch (error) {
        res.status(400).json(error.message);
    }
});

router.post('/create-category', async function (req, res, next) {
    category.createCategory(req.body).then(() => res.status(200).json({"success": "OK"}))
        .catch((e) => res.status(400).send(e))
});

router.post('/create-background', async function (req, res, next) {
    category.createBackground(req.body).then(() => res.status(200).json({"success": "OK"}))
        .catch((e) => res.status(400).send(e))
});

router.get('/getBackgroundImg', async function (req, res, next) {
    try {
        const img = await category.getBackgroundImg()
        res.status(200).json(img);
    } catch (error) {
        res.status(400).json(error.message);
    }
});


module.exports = router;
