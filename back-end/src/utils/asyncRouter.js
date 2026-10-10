const express = require('express');

// Express 4 does not forward rejected promises from async handlers.
const wrap = handler => (req, res, next) => {
  try {
    return Promise.resolve(handler(req, res, next)).catch(next);
  } catch (error) {
    return next(error);
  }
};

module.exports = () => {
  const router = express.Router();
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.flat().map(value => typeof value === 'function' ? wrap(value) : value));
  }
  return router;
};
