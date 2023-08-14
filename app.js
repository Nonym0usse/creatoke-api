var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const authMiddleware = require('./middleware/auth');
const cors = require('cors');

var indexRouter = require('./routes/index');
var adminRouter = require('./routes/admin/index');
var contactRouter = require('./routes/admin/contact');
var categoryRouter = require('./routes/admin/category');
var licenceRouter = require('./routes/admin/licence');
var paymentRouter = require('./routes/admin/payment');
var commentRouter = require('./routes/admin/comment');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
app.use(function(req, res, next) {
  if ((req.get('X-Forwarded-Proto') !== 'https')) {
    res.redirect('https://' + req.get('Host') + req.url);
  } else
    next();
});
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

app.listen(process.env.PORT || 3001);

module.exports = app;
