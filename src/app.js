const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression'); // Añadido para comprimir respuestas HTTP
const swaggerUI = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const config = require('./config/config');
const { limiter, sanitizeInput, securityHeaders, validateMongoId } = require('./middlewares/security.middleware');
const { headerSizeLimit } = require('./middlewares/header-size.middleware');
const { logger, requestLogger, handleUncaughtErrors } = require('./utils/logger');

// Inicializar el manejador de errores no capturados
handleUncaughtErrors();

// Importar rutas
const authRoutes = require('./routes/auth.routes');
// Importar directamente el archivo del controlador simplificado
const simpleAuthController = require('./controllers/simple-auth.controller');
const appointmentRoutes = require('./routes/appointment.routes');
const userRoutes = require('./routes/user.routes');
const doctorRoutes = require('./routes/doctor.routes');

// Inicializar express
const app = express();

// Usar compresión para todas las respuestas
app.use(compression({
  level: 6, // Nivel de compresión balanceado entre velocidad y tamaño
  threshold: 0 // Comprimir todas las respuestas independientemente del tamaño
}));

// Configuración para manejar payloads y headers grandes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Configuración de Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de Gestión de Citas Médicas',
      version: '1.0.0',
      description: 'API REST para sistema de gestión de citas médicas'
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Servidor de desarrollo'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Middlewares
app.use(cors({
  origin: '*', // Permitir solicitudes de cualquier origen para desarrollo
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Request-ID'],
  credentials: false, // Desactivar credenciales para evitar problemas con tokens grandes
  maxAge: 86400, // Caché de preflight por 24 horas
  preflightContinue: false,
  optionsSuccessStatus: 204 // Para navegadores antiguos (IE11)
}));

// Aumentar límites para solicitudes grandes pero no demasiado
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(requestLogger); // Agregar el middleware de logging personalizado
app.use(morgan('dev')); // Cambiar a 'dev' para logs más compactos
app.use(securityHeaders);
app.use(limiter);
app.use(sanitizeInput);
app.use(validateMongoId);

// Rutas
app.use('/api/docs', swaggerUI.serve, swaggerUI.setup(swaggerDocs));

// Rutas de autenticación con middleware específico para detección de cabeceras grandes
app.use('/api/auth', headerSizeLimit, authRoutes);

// Rutas principales de autenticación simplificadas (puntos de entrada optimizados)
app.post('/api/login', headerSizeLimit, simpleAuthController.simpleLogin);
app.post('/api/register', headerSizeLimit, simpleAuthController.simpleRegister);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/doctors', doctorRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  logger.info('Health check realizado');
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Manejador de errores
app.use((err, req, res, next) => {
  logger.error('Error interno del servidor', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Conexión a MongoDB
mongoose.connect(config.mongodb.uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  logger.info('Conectado exitosamente a MongoDB', {
    database: config.mongodb.uri.split('/').pop()
  });
})
.catch(err => {
  logger.error('Error al conectar a MongoDB', {
    error: err.message,
    database: config.mongodb.uri.split('/').pop()
  });
});

module.exports = app;