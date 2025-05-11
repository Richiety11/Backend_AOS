const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config/config');

// Configuración de Rate Limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    message: 'Demasiadas peticiones desde esta IP, por favor intente nuevamente más tarde'
  }
});

// Middleware de sanitización y validación
const sanitizeInput = (req, res, next) => {
  // Sanitizar body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
        // Prevenir XSS
        req.body[key] = req.body[key].replace(/[<>]/g, '');
      }
    });
  }
  next();
};

// Configurar headers de seguridad con helmet
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' }
});

// Validador de MongoDB ID
const validateMongoId = (req, res, next) => {
  const mongoIdPattern = /^[0-9a-fA-F]{24}$/;
  const ids = [...Object.values(req.params), ...Object.values(req.query)]
    .filter(param => typeof param === 'string' && param.match(mongoIdPattern));

  if (ids.some(id => !mongoIdPattern.test(id))) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  next();
};

module.exports = {
  limiter,
  sanitizeInput,
  securityHeaders,
  validateMongoId
};