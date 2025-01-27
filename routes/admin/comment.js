const express = require('express');
const router = express.Router();
const { Comment } = require('../../middleware/admin/Comment');
const verifyTokenMiddleware = require('../../database/auth');

const comment = new Comment();

router.post('/create', async function (req, res, next) {
    comment.createComment(req.body).then(() => res.status(200).json({"success": "OK"}))
        .catch((e) => res.status(400).json({error: e.message}))
});

router.get('/list/:id', async function (req, res, next) {
    comment.getComments(req.params.id).then((data) => res.status(200).json(data))
        .catch((e) => res.status(400).json({error: e.message}))
});

router.get('/list-all', async function (req, res, next) {
    comment.getAllComments().then((data) => res.status(200).json(data))
        .catch((e) => res.status(400).json({error: e.message}))
});

router.delete('/delete/:id', verifyTokenMiddleware, async function (req, res, next) {
    comment.deleteComment(req.params.id).then((data) => res.status(200).json(data))
        .catch((e) => res.status(400).json({error: e.message}))
});

module.exports = router;
