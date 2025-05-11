const dotenv = require('dotenv');
dotenv.config();

const winston = require('winston');
const path = require('path');

// Configuración de Winston
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
    }),
  ],
});

// Si no estamos en producción, también loguear a la consola
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

module.exports = {
  // Configuración del servidor
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Configuración de MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/medical_appointments'
  },
  
  // Configuración de JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '24h'
  },
  
  // Configuración de Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutos por defecto
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // límite de 100 solicitudes por ventana
  },
  
  // Configuración de Winston
  logger,
};