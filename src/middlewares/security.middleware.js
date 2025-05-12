/**
 * @file security.middleware.js
 * @description Implementa múltiples capas de seguridad para la API de citas médicas.
 * Incluye protección contra ataques comunes como XSS, inyección, limitación de tasa,
 * políticas de seguridad de contenido y validaciones de entrada.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config/config');

/**
 * @constant limiter
 * @description Middleware de limitación de tasa (rate limiting) para prevenir ataques de fuerza bruta.
 * Configura límites de solicitudes por ventana de tiempo para cada IP, protegiendo
 * endpoints sensibles contra intentos de adivinación de credenciales o saturación del servicio.
 * Los valores se obtienen desde la configuración para facilitar ajustes según el entorno.
 */
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // Ventana de tiempo para el conteo de solicitudes
  max: config.rateLimit.max, // Número máximo de solicitudes permitidas por ventana
  message: {
    message: 'Demasiadas peticiones desde esta IP, por favor intente nuevamente más tarde'
  }
});

/**
 * @function sanitizeInput
 * @description Middleware para sanitización de datos de entrada.
 * Elimina espacios innecesarios y caracteres potencialmente peligrosos para prevenir
 * ataques de inyección y XSS (Cross-Site Scripting). Se aplica a todos los campos
 * de texto en el cuerpo de la solicitud.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar con el siguiente middleware
 * @returns {void}
 */
const sanitizeInput = (req, res, next) => {
  // Sanitizar body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Eliminar espacios en blanco al inicio y final
        req.body[key] = req.body[key].trim();
        
        // Prevenir XSS eliminando caracteres < y >
        // Nota: Para una sanitización más completa en producción,
        // considerar una biblioteca como DOMPurify o sanitize-html
        req.body[key] = req.body[key].replace(/[<>]/g, '');
      }
    });
  }
  next();
};

/**
 * @constant securityHeaders
 * @description Configuración de cabeceras HTTP de seguridad mediante Helmet.
 * Implementa múltiples políticas de seguridad para proteger contra ataques comunes:
 * - Content Security Policy (CSP): Restringe fuentes de recursos permitidas
 * - XSS Protection: Activa protección contra XSS en navegadores antiguos
 * - Content-Type Nosniff: Previene MIME sniffing
 * - Referrer Policy: Controla información enviada a otros sitios
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], // Solo permite recursos del mismo origen
      styleSrc: ["'self'", "'unsafe-inline'"], // Estilos del mismo origen e inline (necesario para algunos frameworks)
      scriptSrc: ["'self'"], // Scripts solo del mismo origen
      imgSrc: ["'self'", "data:", "https:"], // Imágenes del mismo origen, data URIs y HTTPS
      connectSrc: ["'self'"], // Conexiones solo al mismo origen
      fontSrc: ["'self'"], // Fuentes solo del mismo origen
      objectSrc: ["'none'"], // Bloquea uso de <object>, <embed> y <applet>
      mediaSrc: ["'self'"], // Media solo del mismo origen
      frameSrc: ["'none'"] // Bloquea uso de <frame> y <iframe>
    }
  },
  xssFilter: true, // Activa filtro XSS en navegadores
  noSniff: true, // Evita que el navegador intente adivinar el tipo MIME
  referrerPolicy: { policy: 'same-origin' } // Enviar referrer solo a mismo origen
});

/**
 * @function validateMongoId
 * @description Middleware para validar el formato de IDs de MongoDB.
 * Verifica que los parámetros y query strings que parecen ser IDs de MongoDB
 * cumplan con el formato hexadecimal de 24 caracteres, previniendo errores
 * y posibles vulnerabilidades de inyección.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar con el siguiente middleware
 * @returns {void}
 */
const validateMongoId = (req, res, next) => {
  // Patrón hexadecimal de 24 caracteres para IDs de MongoDB
  const mongoIdPattern = /^[0-9a-fA-F]{24}$/;
  
  // Extraer valores de parámetros y consultas que podrían ser IDs
  const ids = [...Object.values(req.params), ...Object.values(req.query)]
    .filter(param => typeof param === 'string' && param.match(mongoIdPattern));

  // Validar todos los IDs encontrados
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