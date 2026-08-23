const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  logger.error(`${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    const friendly = {
      patientId: 'Patient ID (UHID) already exists — please try registering again',
      email: 'Email already exists',
      employeeId: 'Employee ID already exists',
      name: 'This name is already on the list. Open the existing item and add stock / update it instead.',
      barcode: 'Barcode already used. Open that medicine and add a batch.',
      userId: 'This entry was already saved. Please refresh and try again.',
      user: 'This record is already in the system. Please refresh and try again.',
      createdBy: 'This item is already on the list. Please refresh and use the existing one.',
      addedBy: 'This entry was already saved. Please refresh and try again.',
      billNumber: 'This bill number already exists. Please try saving again.',
      admissionNumber: 'This admission number already exists. Please try again.',
      medicine: 'This medicine is already on the list. Open it and add a batch instead.',
    };
    error.message = friendly[field] || 'This value is already in use. Please change it or refresh and try again.';
    error.statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const parts = Object.values(err.errors || {}).map((e) => e.message).filter(Boolean);
    error.message = parts.length ? parts.join('. ') : 'Please check the form and try again.';
    error.statusCode = 400;
  }

  const status = error.statusCode || 500;
  let message = error.message || 'Something went wrong. Please try again.';
  const technical = /E11000|Cast to ObjectId|userId already exists|MongoServer|TypeError|ValidationError:| at /i.test(message)
    || message.length > 180;
  if (status >= 500 && technical) {
    message = 'Something went wrong. Please try again or contact the administrator.';
  }

  res.status(status).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;
