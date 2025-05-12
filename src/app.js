/**
 * Archivo principal de configuración de la aplicación Express.
 * Configura middlewares, rutas y manejo de errores para la API REST.
 */

// Importación de módulos y dependencias principales
const express = require('express'); // Framework web para Node.js
const mongoose = require('mongoose'); // ODM para MongoDB
const cors = require('cors'); // Middleware para habilitar CORS
const morgan = require('morgan'); // Logger de solicitudes HTTP
const compression = require('compression'); // Middleware para comprimir respuestas HTTP
const swaggerUI = require('swagger-ui-express'); // UI para documentación Swagger
const swaggerJsDoc = require('swagger-jsdoc'); // Generador de documentación Swagger
const config = require('./config/config'); // Configuraciones de la aplicación
const { limiter, sanitizeInput, securityHeaders, validateMongoId } = require('./middlewares/security.middleware'); // Middlewares de seguridad
const { headerSizeLimit } = require('./middlewares/header-size.middleware'); // Middleware para limitar tamaño de headers
const { logger, requestLogger, handleUncaughtErrors } = require('./utils/logger'); // Utilidades de logging

// Inicializar el manejador global de errores no capturados para evitar caídas del servidor
handleUncaughtErrors();

/**
 * Importación de módulos de rutas para los diferentes endpoints de la API
 */
const authRoutes = require('./routes/auth.routes'); // Rutas de autenticación completas
const simpleAuthController = require('./controllers/simple-auth.controller'); // Controlador simplificado de autenticación para optimizar rutas críticas
const appointmentRoutes = require('./routes/appointment.routes'); // Rutas para gestión de citas
const userRoutes = require('./routes/user.routes'); // Rutas para gestión de usuarios
const doctorRoutes = require('./routes/doctor.routes'); // Rutas para gestión de médicos

// Importar la función para inicializar el scheduler que actualiza automáticamente el estado de las citas
const { initAppointmentStatusScheduler } = require('./controllers/appointment.controller');

// Inicializar la aplicación Express
const app = express();

/**
 * Configuración de compresión HTTP para optimizar el rendimiento
 * - Reduce el tamaño de las respuestas enviadas al cliente
 * - Mejora la velocidad de carga y reduce el consumo de ancho de banda
 */
app.use(compression({
  level: 6, // Nivel de compresión balanceado entre velocidad y tamaño (1-9, donde 9 es máxima compresión)
  threshold: 0 // Comprimir todas las respuestas independientemente del tamaño (en bytes)
}));

/**
 * Configuración para el análisis de cuerpos de solicitudes
 * - Establece límites para evitar ataques de tipo DoS
 */
app.use(express.json({ limit: '1mb' })); // Analiza solicitudes con content-type application/json
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Analiza solicitudes con content-type application/x-www-form-urlencoded

/**
 * Configuración de Swagger para documentación automática de la API
 * - Define la información básica de la API
 * - Configura los servidores disponibles
 * - Establece esquemas de seguridad utilizados (JWT)
 * - Define dónde encontrar los comentarios Swagger para generar la documentación
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0', // Versión de OpenAPI
    info: {
      title: 'API de Gestión de Citas Médicas', // Título de la API
      version: '1.0.0', // Versión de la API
      description: 'API REST para sistema de gestión de citas médicas' // Descripción general
    },
    servers: [
      {
        url: `http://localhost:${config.port}`, // URL del servidor
        description: 'Servidor de desarrollo' // Entorno
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { // Esquema de autenticación JWT
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js'] // Archivos donde buscar anotaciones de Swagger
};

// Generar la documentación a partir de la configuración y comentarios en el código
const swaggerDocs = swaggerJsDoc(swaggerOptions);

/**
 * Configuración de CORS (Cross-Origin Resource Sharing)
 * Permite que el frontend acceda a los recursos del backend cuando están en dominios diferentes
 */
app.use(cors({
  origin: '*', // Permitir solicitudes de cualquier origen (en producción, se recomienda especificar dominios concretos)
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos HTTP permitidos
  allowedHeaders: ['Content-Type', 'Authorization', 'cache-control'], // Cabeceras permitidas en solicitudes
  exposedHeaders: ['Content-Length', 'X-Request-ID'], // Cabeceras expuestas en respuestas
  credentials: false, // Desactivar envío de cookies en solicitudes CORS (evita problemas con tokens grandes)
  maxAge: 86400, // Tiempo de caché de respuestas preflight en segundos (24 horas)
  preflightContinue: false, // No pasar solicitudes preflight a los manejadores siguientes
  optionsSuccessStatus: 204 // Código de estado para respuestas preflight exitosas (compatible con IE11)
}));

/**
 * Configuración de middlewares para procesamiento de solicitudes y seguridad
 */
// Aumentar límites para solicitudes grandes pero no excesivamente para evitar ataques DoS
app.use(express.json({ limit: '1mb' })); // Límite para payload JSON
app.use(express.urlencoded({ extended: false, limit: '1mb' })); // Límite para datos codificados en URL

// Middlewares de logging y seguridad
app.use(requestLogger); // Registra todas las solicitudes con información detallada
app.use(morgan('dev')); // Logger HTTP para desarrollo con formato compacto y colorido
app.use(securityHeaders); // Añade cabeceras de seguridad (X-XSS-Protection, Content-Security-Policy, etc.)
app.use(limiter); // Limita la tasa de solicitudes para prevenir ataques de fuerza bruta
app.use(sanitizeInput); // Sanitiza entrada para prevenir inyecciones y XSS
app.use(validateMongoId); // Valida IDs de MongoDB en parámetros para evitar errores

/**
 * Configuración de rutas de la API
 */
// Ruta para la documentación Swagger de la API accesible vía navegador
app.use('/api/docs', swaggerUI.serve, swaggerUI.setup(swaggerDocs));

// Rutas de autenticación con middleware para prevenir ataques de cabeceras excesivamente grandes
app.use('/api/auth', headerSizeLimit, authRoutes);

/**
 * Rutas principales de autenticación optimizadas
 * - Implementación simplificada para mejorar rendimiento en puntos críticos de entrada
 * - Evita la sobrecarga de middleware innecesario para estas operaciones frecuentes
 */
app.post('/api/login', headerSizeLimit, simpleAuthController.simpleLogin);
app.post('/api/register', headerSizeLimit, simpleAuthController.simpleRegister);

/**
 * Middleware específico para interceptar y loggear todas las llamadas a /api/users/current
 * - Ruta crítica para la verificación del estado de autenticación del usuario
 * - Implementa manejo especial de CORS para esta ruta que suele causar problemas en navegadores
 * - Registra información detallada para diagnóstico de problemas de autenticación
 */
app.use('/api/users/current', (req, res, next) => {
  // Registrar información detallada de cada solicitud para diagnóstico
  logger.info('Solicitud interceptada en /api/users/current', {
    method: req.method, // Método HTTP (GET, POST, OPTIONS, etc.)
    headers: {
      auth: req.headers.authorization ? 'presente' : 'ausente', // Verificar presencia de token
      contentType: req.headers['content-type'], // Tipo de contenido enviado
      userAgent: req.headers['user-agent'] // Información del cliente
    },
    query: req.query, // Parámetros de consulta
    ip: req.ip // Dirección IP del cliente
  });
  
  // Manejo especial para solicitudes preflight CORS (OPTIONS)
  // Necesario para que el navegador permita la solicitud real después del preflight
  if (req.method === 'OPTIONS') {
    logger.debug('Respondiendo a solicitud preflight CORS para /users/current');
    return res.status(200) // Respuesta exitosa para preflight
      .header('Access-Control-Allow-Origin', '*') // Permitir cualquier origen
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS') // Métodos permitidos
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, cache-control') // Cabeceras permitidas
      .header('Access-Control-Expose-Headers', 'Content-Length, X-Request-ID') // Cabeceras expuestas al cliente
      .send();
  }
  
  // Para solicitudes normales (no OPTIONS), continuar con el flujo normal
  next();
});

/**
 * Middleware específico para interceptar solicitudes a /api/appointments/archived
 * - Resuelve problemas CORS específicos con esta ruta que maneja citas archivadas
 * - Permite el encabezado cache-control que suelen enviar los navegadores modernos
 * - Registra información detallada para diagnóstico de problemas
 */
app.use('/api/appointments/archived', (req, res, next) => {
  // Registrar información detallada de cada solicitud para diagnóstico
  logger.info('Solicitud interceptada en /api/appointments/archived', {
    method: req.method, // Método HTTP utilizado
    headers: {
      auth: req.headers.authorization ? 'presente' : 'ausente', // Verificar autenticación
      contentType: req.headers['content-type'], // Tipo de contenido
      cacheControl: req.headers['cache-control'] // Directivas de caché (importante para esta ruta)
    },
    query: req.query, // Parámetros de consulta (filtros de citas)
    ip: req.ip // Dirección IP del cliente
  });
  
  // Manejo especial para solicitudes preflight CORS (OPTIONS)
  // Crucial para permitir el encabezado cache-control que causa problemas en esta ruta
  if (req.method === 'OPTIONS') {
    logger.debug('Respondiendo a solicitud preflight CORS para /appointments/archived');
    return res.status(200) // Respuesta exitosa para preflight
      .header('Access-Control-Allow-Origin', '*') // Permitir cualquier origen
      .header('Access-Control-Allow-Methods', 'GET, OPTIONS') // Métodos permitidos
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, cache-control') // Incluye cache-control
      .header('Access-Control-Expose-Headers', 'Content-Length, X-Request-ID') // Cabeceras expuestas
      .send();
  }
  
  // Para solicitudes normales (no OPTIONS), continuar con el flujo normal
  next();
});

/**
 * Registro de rutas principales de la API
 * - Cada módulo agrupa funcionalidades relacionadas
 * - Todos los endpoints estarán prefijados con /api/
 */
app.use('/api/appointments', appointmentRoutes); // Rutas para gestión de citas
app.use('/api/users', userRoutes); // Rutas para gestión de usuarios
app.use('/api/doctors', doctorRoutes); // Rutas para gestión de médicos

/**
 * Endpoint para verificación de salud del servicio
 * - Útil para monitoreo, balanceadores de carga y pruebas de disponibilidad
 * - Permite verificar que la API está funcionando correctamente
 */
app.get('/api/health', (req, res) => {
  logger.info('Health check realizado');
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date() 
  });
});

/**
 * Middleware global de manejo de errores
 * - Captura todos los errores no manejados en rutas y middlewares anteriores
 * - Registra información detallada del error para diagnóstico
 * - Envía respuesta estandarizada al cliente
 * - Oculta detalles sensibles en producción
 */
app.use((err, req, res, next) => {
  // Registrar información detallada del error para diagnóstico interno
  logger.error('Error interno del servidor', {
    error: err.message, // Mensaje de error
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Stack trace solo en desarrollo
    path: req.path, // Ruta que causó el error
    method: req.method // Método HTTP que causó el error
  });

  // Enviar respuesta estandarizada al cliente
  res.status(500).json({
    message: 'Error interno del servidor', // Mensaje genérico
    error: process.env.NODE_ENV === 'development' ? err.message : undefined // Detalles solo en desarrollo
  });
});

/**
 * Conexión a la base de datos MongoDB
 * - Utiliza las configuraciones del archivo de configuración
 * - Establece opciones modernas del driver de MongoDB
 * - Inicializa el programador de citas después de la conexión exitosa
 */
mongoose.connect(config.mongodb.uri, {
  useNewUrlParser: true, // Usar el nuevo parser de URL para evitar advertencias
  useUnifiedTopology: true // Usar el nuevo motor de topología para mejor manejo de conexiones
})
.then(() => {
  // Registrar conexión exitosa
  logger.info('Conectado exitosamente a MongoDB', {
    database: config.mongodb.uri.split('/').pop() // Nombre de la base de datos (extraído de la URI)
  });
  
  // Iniciar el programador de actualización automática de estados de citas
  // Solo se inicia cuando la conexión a la BD está establecida para garantizar su funcionamiento
  initAppointmentStatusScheduler();
  logger.info('Inicializado el programador de actualización de estados de citas');
})
.catch(err => {
  // Registrar error de conexión para diagnóstico
  logger.error('Error al conectar a MongoDB', {
    error: err.message,
    database: config.mongodb.uri.split('/').pop()
  });
});

// Exportar la aplicación Express configurada para ser utilizada en server.js
module.exports = app;