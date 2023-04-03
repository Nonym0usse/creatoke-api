var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const authMiddleware = require('./middleware/auth');

var indexRouter = require('./routes/index');
var adminRouter = require('./routes/admin/index');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/', indexRouter);
app.use('/admin', adminRouter);

module.exports = app;
