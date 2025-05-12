/**
 * @file header-size.middleware.js
 * @description Middleware especializado para detectar y prevenir problemas relacionados con
 * cabeceras HTTP de tamaño excesivo, que pueden provocar errores 431 (Request Header Fields Too Large).
 * Implementa controles y optimizaciones para mejorar la robustez de la API ante solicitudes
 * con cabeceras de gran tamaño, especialmente en rutas de autenticación.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');

/**
 * @constant {number} MAX_HEADER_SIZE
 * @description Tamaño máximo permitido para el conjunto de cabeceras en bytes.
 * Establecido en 16KB, un valor incrementado respecto al estándar para
 * proporcionar mayor flexibilidad en la API.
 */
const MAX_HEADER_SIZE = 16384; // 16KB - Incrementado para mayor flexibilidad

/**
 * @function headerSizeLimit
 * @description Middleware para verificar y controlar el tamaño de las cabeceras HTTP.
 * Analiza tanto el tamaño total de todas las cabeceras como el de cada cabecera individual,
 * para detectar posibles problemas antes de que alcancen el servidor web subyacente.
 * Proporciona mensajes de error específicos según la ruta afectada.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar con el siguiente middleware
 * @returns {void}
 */
const headerSizeLimit = (req, res, next) => {
  try {
    // Calcular el tamaño aproximado de todas las cabeceras combinadas
    let headerSize = 0;
    for (const [key, value] of Object.entries(req.headers)) {
      // Sumar la longitud del nombre de la cabecera y su valor
      // Para valores no string, convertir a JSON para calcular su tamaño
      headerSize += key.length + (typeof value === 'string' ? value.length : JSON.stringify(value).length);
    }

    // Verificar cabeceras individuales que excedan un límite razonable (2KB)
    let largeHeadersFound = false;
    for (const [key, value] of Object.entries(req.headers)) {
      const headerValueSize = typeof value === 'string' ? value.length : JSON.stringify(value).length;
      
      // Límite de 2KB para cabeceras individuales - valor más permisivo que el estándar
      if (headerValueSize > 2048) {
        logger.warn(`Cabecera demasiado grande detectada: ${key} (${headerValueSize} bytes)`);
        largeHeadersFound = true;
      }
    }
    
    // Acción especial si se detectan cabeceras grandes y el tamaño total excede el límite
    // Esta condición combinada evita bloquear solicitudes donde solo una cabecera es grande
    // pero el tamaño total aún es manejable
    if (largeHeadersFound && headerSize > MAX_HEADER_SIZE) {
      logger.warn(`Cabeceras demasiado grandes detectadas (${headerSize} bytes)`);
      
      // Mensajes de error específicos para rutas de autenticación
      // ayudan a guiar al usuario sobre cómo resolver el problema
      if (req.path.includes('/login') || req.path.includes('/register') || req.path.includes('/auth')) {
        return res.status(431).json({
          message: 'Cabeceras de solicitud demasiado grandes. Por favor, utilice un correo electrónico más corto u optimice los datos enviados.'
        });
      }
    }

    // Control final: verificar si el tamaño total excede el límite máximo
    if (headerSize > MAX_HEADER_SIZE) {
      logger.warn(`Tamaño total de cabeceras excede el límite: ${headerSize} bytes`);
      
      // Responder con un error 431 (Request Header Fields Too Large)
      return res.status(431).json({ 
        message: 'Cabeceras de solicitud demasiado grandes.',
        error: 'Request Header Fields Too Large' 
      });
    }

    // Si todas las verificaciones pasan, permitir que la solicitud continúe
    next();
  } catch (error) {
    // Capturar y registrar cualquier error inesperado en el middleware
    logger.error('Error en middleware de tamaño de cabeceras:', error);
    next(error);
  }
};

module.exports = {
  headerSizeLimit
};
