/**
 * @file auth.middleware.js
 * @description Middlewares de autenticación y autorización para proteger rutas de la API.
 * Este módulo proporciona funcionalidades para verificar tokens JWT, validar usuarios
 * y controlar accesos basados en roles. Implementa logging detallado para seguimiento
 * de eventos de seguridad y resolución de problemas.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const { logger } = require('../utils/logger');

/**
 * @function auth
 * @description Middleware para verificar la autenticación mediante token JWT.
 * Extrae el token del encabezado Authorization, lo verifica, y agrega el usuario
 * a la solicitud para uso en los controladores. Admite tokens para ambos tipos de usuarios.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} res - Objeto de respuesta Express
 * @param {Function} next - Función para continuar con el siguiente middleware
 * @returns {void}
 */
const auth = async (req, res, next) => {
  try {
    // Extraer el token del encabezado Authorization (formato: "Bearer TOKEN")
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      // Registrar intento de acceso sin token para auditoría
      logger.warn('Intento de acceso sin token', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ message: 'Token de autenticación no proporcionado' });
    }

    // Verificar y decodificar el token usando la clave secreta
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Obtener el ID del usuario desde 'sub' (como se define en generateToken)
    const userId = decoded.sub || decoded.id;
    
    // Buscar al usuario en ambos modelos (User y Doctor)
    // Esta doble búsqueda permite un sistema unificado de autenticación
    let user = await User.findById(userId);
    if (!user) {
      user = await Doctor.findById(userId);
    }

    // Validar que el usuario existe y está activo
    if (!user) {
      logger.warn('Usuario no encontrado con token válido', {
        userId: userId,
        path: req.path
      });
      throw new Error('Usuario no encontrado');
    }

    // Registrar evento exitoso de autenticación para depuración
    logger.debug('Usuario autenticado exitosamente', {
      userId: user._id,
      role: user.role,
      path: req.path
    });

    // Agregar el usuario y token a la solicitud para uso en controladores
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    // Registrar error detallado para depuración
    logger.error('Error de autenticación', {
      error: error.message,
      path: req.path,
      method: req.method
    });
    res.status(401).json({ 
      message: 'Por favor, inicie sesión nuevamente',
      error: error.message
    });
  }
};

/**
 * @function checkRole
 * @description Middleware para verificación de roles de usuario.
 * Restricción de acceso basada en roles, complementa el middleware de autenticación.
 * Tiene en cuenta la particularidad de los médicos que no tienen un campo 'role' explícito.
 * 
 * @param {Array<string>} roles - Lista de roles permitidos para acceder al recurso
 * @returns {Function} Middleware Express para verificación de roles
 */
const checkRole = (roles) => {
  return (req, res, next) => {
    // Verificar que el usuario esté autenticado
    if (!req.user) {
      logger.warn('Intento de acceso sin usuario autenticado', {
        path: req.path,
        method: req.method
      });
      return res.status(401).json({ message: 'No autorizado' });
    }

    // Verificación de rol considerando tanto el campo 'role' como el tipo de modelo
    const hasRole = roles.includes(req.user.role) || 
                   (req.user.constructor.modelName === 'Doctor' && roles.includes('doctor'));
    
    // Denegar acceso si el usuario no tiene un rol permitido
    if (!hasRole) {
      logger.warn('Intento de acceso con rol no autorizado', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path
      });
      return res.status(403).json({ 
        message: 'No tiene permisos suficientes para realizar esta acción' 
      });
    }

    // Registrar verificación exitosa de rol
    logger.debug('Verificación de rol exitosa', {
      userId: req.user._id,
      userRole: req.user.role,
      path: req.path
    });

    next();
  };
};

module.exports = {
  auth,
  checkRole
};