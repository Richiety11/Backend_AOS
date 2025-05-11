/**
 * Configuración del sistema de logs para el backend
 * Utiliza winston para manejar diferentes niveles y formatos de log
 */
const winston = require('winston');
const path = require('path');

// Configuración de formatos personalizados para los logs
const formats = {
  // Formato para consola con colores
  console: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  
  // Formato para archivos
  file: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  )
};

/**
 * Creación del logger con múltiples transportes
 * - Consola para desarrollo
 * - Archivo para todos los logs (combined.log)
 * - Archivo separado para errores (error.log)
 */
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    // Logs en consola (solo en desarrollo)
    new winston.transports.Console({
      format: formats.console,
      level: 'debug'
    }),
    
    // Todos los logs en combined.log
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      format: formats.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Solo errores en error.log
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      format: formats.file,
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

/**
 * Middleware para registrar las peticiones HTTP
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requestLogger = (req, res, next) => {
  // Registra el inicio de la petición
  const start = Date.now();
  
  // Registra información cuando la respuesta se complete
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });

  next();
};

// Función para registrar errores no manejados
const handleUncaughtErrors = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    // En producción, deberíamos reiniciar el proceso
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason,
      promise
    });
  });
};

module.exports = {
  logger,
  requestLogger,
  handleUncaughtErrors
};