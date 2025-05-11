const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const { logger } = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      logger.warn('Intento de acceso sin token', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ message: 'Token de autenticación no proporcionado' });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Obtener el ID del usuario desde 'sub' (como se define en generateToken)
    const userId = decoded.sub || decoded.id;
    
    // Buscar usuario en ambos modelos
    let user = await User.findById(userId);
    if (!user) {
      user = await Doctor.findById(userId);
    }

    if (!user) {
      logger.warn('Usuario no encontrado con token válido', {
        userId: userId,
        path: req.path
      });
      throw new Error('Usuario no encontrado');
    }

    logger.debug('Usuario autenticado exitosamente', {
      userId: user._id,
      role: user.role,
      path: req.path
    });

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
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

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Intento de acceso sin usuario autenticado', {
        path: req.path,
        method: req.method
      });
      return res.status(401).json({ message: 'No autorizado' });
    }

    const hasRole = roles.includes(req.user.role) || 
                   (req.user.constructor.modelName === 'Doctor' && roles.includes('doctor'));
    
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