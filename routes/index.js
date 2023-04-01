var express = require('express');
var router = express.Router();
const firebase = require('../database/firebase');
const User = require("../models/User");

/* GET home page. */
router.get('/', function(req, res, next) {
  const productsRef = firebase.db.collection('products');
  const user = new User('ismael', 'test');
  productsRef.doc().set(user).then(r => res.send(r));
});

router.get('/', function(req, res, next) {
  const productsRef = firebase.db.collection('products');
  productsRef.doc().set({'title': "bonjour"}).then(r => res.send(r));
});

module.exports = router;
