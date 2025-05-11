/**
 * Middleware para detectar y prevenir problemas de cabeceras HTTP demasiado grandes (error 431)
 */

const { logger } = require('../utils/logger');

// Tamaño máximo permitido para cabeceras en bytes
const MAX_HEADER_SIZE = 16384; // 16KB - Incrementado para mayor flexibilidad

/**
 * Middleware para verificar el tamaño de las cabeceras y prevenir errores 431
 */
const headerSizeLimit = (req, res, next) => {
  try {
    // Calcular el tamaño aproximado de las cabeceras
    let headerSize = 0;
    for (const [key, value] of Object.entries(req.headers)) {
      headerSize += key.length + (typeof value === 'string' ? value.length : JSON.stringify(value).length);
    }

    // Verificar si alguna cabecera individual es demasiado grande
    let largeHeadersFound = false;
    for (const [key, value] of Object.entries(req.headers)) {
      const headerValueSize = typeof value === 'string' ? value.length : JSON.stringify(value).length;
      
      // Aumentamos el límite a 2KB para cabeceras individuales
      if (headerValueSize > 2048) {
        logger.warn(`Cabecera demasiado grande detectada: ${key} (${headerValueSize} bytes)`);
        largeHeadersFound = true;
      }
    }
    
    // Solo bloqueamos si las cabeceras son excesivamente grandes
    if (largeHeadersFound && headerSize > MAX_HEADER_SIZE) {
      logger.warn(`Cabeceras demasiado grandes detectadas (${headerSize} bytes)`);
      
      // Para rutas de autenticación, devolver un error específico
      if (req.path.includes('/login') || req.path.includes('/register') || req.path.includes('/auth')) {
        return res.status(431).json({
          message: 'Cabeceras de solicitud demasiado grandes. Por favor, utilice un correo electrónico más corto u optimice los datos enviados.'
        });
      }
    }

    // Verificar tamaño total de cabeceras
    if (headerSize > MAX_HEADER_SIZE) {
      logger.warn(`Tamaño total de cabeceras excede el límite: ${headerSize} bytes`);
      
      // Responder con un error 431 específico
      return res.status(431).json({ 
        message: 'Cabeceras de solicitud demasiado grandes.',
        error: 'Request Header Fields Too Large' 
      });
    }

    // Todo bien, continuar con la solicitud
    next();
  } catch (error) {
    logger.error('Error en middleware de tamaño de cabeceras:', error);
    next(error);
  }
};

module.exports = {
  headerSizeLimit
};
