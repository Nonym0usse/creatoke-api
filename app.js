var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
const cors = require('cors');

var indexRouter = require('./routes/index');
var adminRouter = require('./routes/admin/index');
var contactRouter = require('./routes/admin/contact');
var categoryRouter = require('./routes/admin/category');
var licenceRouter = require('./routes/admin/licence');
var paymentRouter = require('./routes/admin/payment');
var commentRouter = require('./routes/admin/comment');
var renewTokenRouter = require('./routes/admin/renew-token');
var n8nRouter = require('./routes/admin/n8n');
require('dotenv').config();

var app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Adjust for security
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Type'); // Ensure headers are visible
  next();
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb', parameterLimit: 1000000 }));
app.use(cookieParser());
app.use(cors());

app.set('trust proxy', true); // important derrière nginx/traefik
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { maxAge: '7d' }));



app.use('/', indexRouter);
app.use('/admin', adminRouter);
app.use('/contact', contactRouter);
app.use('/category', categoryRouter);
app.use('/licence', licenceRouter);
app.use('/payment', paymentRouter);
app.use('/comment', commentRouter);
app.use('/auth', renewTokenRouter);
app.use('/n8n', n8nRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

app.listen(process.env.PORT || 3001);

module.exports = app;
