const errorHandler = (err, req, res, next) => {
  let status  = err.statusCode || 500;
  let message = err.message    || 'Server error';

  /* Mongoose bad ObjectId */
  if (err.name === 'CastError') {
    status  = 404;
    message = `Resource not found`;
  }

  /* Mongoose duplicate key */
  if (err.code === 11000) {
    status  = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }

  /* Mongoose validation error */
  if (err.name === 'ValidationError') {
    status  = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('❌ ', err);
  }

  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;