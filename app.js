var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const authMiddleware = require('./middleware/auth');
const cors = require('cors');
var fs = require('fs');
var https = require('https');
const log4js = require('log4js');

log4js.configure({
  appenders: { everything: { type: 'file', filename: 'logs.log' } },
  categories: { default: { appenders: ['everything'], level: 'ALL' } }
});

const loggers = log4js.getLogger();
loggers.debug('log message');

var certificate = fs.readFileSync( './key.pem' );
var indexRouter = require('./routes/index');
var adminRouter = require('./routes/admin/index');
var contactRouter = require('./routes/admin/contact');
var categoryRouter = require('./routes/admin/category');
var licenceRouter = require('./routes/admin/licence');
var paymentRouter = require('./routes/admin/payment');
var commentRouter = require('./routes/admin/comment');

var app = express();
app.get('/log', (req, res) => {
  res.sendFile(path.join(__dirname + '/logs.log'));
});
https.createServer({
    cert: certificate
}, app).listen(process.env.PORT || 3001);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/contact', contactRouter);
app.use('/category', categoryRouter);
app.use('/licence', licenceRouter);
app.use('/payment', paymentRouter);
app.use('/comment', commentRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});


module.exports = app;
