'use strict';

// Wraps an async route handler and forwards any rejection to Express error middleware.
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
