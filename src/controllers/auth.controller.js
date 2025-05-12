/**
 * @file auth.controller.js
 * @description Controlador de Autenticación principal del sistema.
 * Este módulo maneja todas las operaciones relacionadas con la autenticación 
 * de usuarios, incluyendo registro, inicio de sesión, obtención de perfil y renovación
 * de tokens de acceso. Implementa medidas avanzadas de seguridad como bloqueo temporal
 * por intentos fallidos de inicio de sesión y generación de tokens seguros.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

/**
 * @constant {Map} loginAttempts - Cache en memoria para rastrear intentos fallidos de inicio de sesión
 * Se utiliza un Map para almacenar correos electrónicos como claves y objetos
 * con contador de intentos y tiempo de bloqueo como valores
 */
const loginAttempts = new Map();

/**
 * @constant {number} MAX_LOGIN_ATTEMPTS - Número máximo de intentos permitidos antes del bloqueo
 */
const MAX_LOGIN_ATTEMPTS = 5;

/**
 * @constant {number} LOCK_TIME - Período de bloqueo en milisegundos (15 minutos)
 */
const LOCK_TIME = 15 * 60 * 1000;

/**
 * @function generateToken
 * @description Genera un token JWT de acceso con payload optimizado
 * 
 * @param {string|ObjectId} id - ID del usuario
 * @returns {string} Token JWT de acceso firmado
 */
const generateToken = (id) => {
  // Usar payload mínimo y algoritmo eficiente para reducir tamaño del token
  return jwt.sign({ 
    sub: id.toString(), // Convertir a string para asegurar compatibilidad
    id: id.toString()   // Incluir también como 'id' para compatibilidad con el middleware existente
  }, 
  config.jwt.secret, 
  {
    expiresIn: '3h', // Token válido por 3 horas
    algorithm: 'HS256',
    notBefore: 0
  });
};

/**
 * @function generateRefreshToken
 * @description Genera un token JWT de refresco de larga duración
 * 
 * @param {string|ObjectId} id - ID del usuario
 * @returns {string} Token JWT de refresco firmado
 */
const generateRefreshToken = (id) => {
  // Simplificar el refresh token e incluir marcador de tipo
  return jwt.sign({ 
    sub: id.toString(),
    type: 'refresh'
  }, 
  config.jwt.secret, 
  {
    expiresIn: '7d',  // Token de refresco válido por 7 días
    algorithm: 'HS256'
  });
};

/**
 * @function register
 * @description Registra un nuevo usuario en el sistema, ya sea paciente o médico
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Datos de registro del usuario
 * @param {string} req.body.email - Correo electrónico del usuario
 * @param {string} req.body.password - Contraseña del usuario
 * @param {string} req.body.name - Nombre completo del usuario
 * @param {string} [req.body.phoneNumber] - Número telefónico del usuario
 * @param {string} [req.body.role='patient'] - Rol del usuario ('patient' o 'doctor')
 * @param {string} [req.body.speciality] - Especialidad médica (requerido si role='doctor')
 * @param {string} [req.body.licenseNumber] - Número de licencia médica (requerido si role='doctor')
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con token, refreshToken y datos del usuario creado
 */
const register = async (req, res) => {
  try {
    const { email, password, name, phoneNumber, role, speciality, licenseNumber } = req.body;

    // Verificar si el usuario ya existe para prevenir duplicados
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    // Crear usuario según el rol especificado
    let user;
    if (role === 'doctor') {
      // Validación adicional para médicos
      if (!speciality || !licenseNumber) {
        return res.status(400).json({ message: 'La especialidad y número de licencia son requeridos para médicos' });
      }
      user = new Doctor({ email, password, name, phoneNumber, speciality, licenseNumber });
    } else {
      // Usuario paciente por defecto
      user = new User({ email, password, name, phoneNumber, role: role || 'patient' });
    }

    // Guardar usuario en la base de datos
    await user.save();
    
    // Generar tokens de autenticación
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Respuesta exitosa con datos de usuario y tokens
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: role || 'patient',
        ...(role === 'doctor' && {
          speciality: user.speciality,
          licenseNumber: user.licenseNumber
        })
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar usuario', error: error.message });
  }
};

/**
 * @function login
 * @description Autentifica a un usuario y emite tokens de acceso y refresco opcionales.
 * Implementa sistema de bloqueo temporal tras múltiples intentos fallidos.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Credenciales de usuario
 * @param {string} req.body.email - Correo electrónico del usuario
 * @param {string} req.body.password - Contraseña del usuario
 * @param {Object} req.query - Parámetros de consulta
 * @param {boolean} [req.query.withRefresh] - Indica si se requiere un refresh token
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con token y datos del usuario autenticado
 */
const login = async (req, res) => {
  try {
    // Validar que se recibieron los campos necesarios
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'El correo y contraseña son requeridos' });
    }

    // Verificar si la cuenta está bloqueada por intentos fallidos previos
    const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil > Date.now()) {
      return res.status(429).json({ 
        message: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
        lockUntil: attempts.lockUntil
      });
    }

    // Buscar usuario en ambos modelos (User y Doctor) con manejo robusto de errores
    let user = null;
    let isDoctor = false;
    
    try {
      // Primero buscar en la colección de usuarios regulares
      user = await User.findOne({ email }).select('+password');
    } catch (err) {
      console.error("Error buscando usuario:", err);
    }

    if (!user) {
      try {
        // Si no se encontró usuario, buscar en la colección de médicos
        user = await Doctor.findOne({ email }).select('+password');
        if (user) isDoctor = true;
      } catch (err) {
        console.error("Error buscando doctor:", err);
      }
    }

    // Si no se encontró el usuario en ninguna colección
    if (!user) {
      updateLoginAttempts(email); // Incrementar intentos fallidos
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Verificar la contraseña con manejo de errores
    let isMatch = false;
    try {
      isMatch = await user.comparePassword(password);
    } catch (err) {
      console.error("Error comparando passwords:", err);
      return res.status(500).json({ message: 'Error al verificar credenciales' });
    }
    
    // Si la contraseña no coincide
    if (!isMatch) {
      updateLoginAttempts(email); // Incrementar intentos fallidos
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Login exitoso: restablecer contador de intentos fallidos
    loginAttempts.delete(email);

    // Generar token de acceso estándar
    const token = generateToken(user._id);
    
    // Sólo generar refresh token si el cliente lo solicita específicamente
    // Esto reduce el tamaño de la respuesta cuando no es necesario
    const refreshToken = req.query.withRefresh ? generateRefreshToken(user._id) : null;

    // Construir objeto de respuesta con información mínima necesaria del usuario
    const userResponse = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: isDoctor ? 'doctor' : user.role
    };
    
    // Añadir información específica para médicos cuando corresponda
    if (isDoctor && user.speciality) {
      userResponse.speciality = user.speciality;
    }

    // Respuesta optimizada para reducir tamaño
    const response = {
      token,
      user: userResponse
    };
    
    // Incluir refresh token sólo si fue solicitado y generado
    if (refreshToken) {
      response.refreshToken = refreshToken;
    }

    // Optimización de cabeceras HTTP para reducir tamaño
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: 'Error al iniciar sesión' });
  }
};

/**
 * @function refreshAccessToken
 * @description Renueva un token de acceso utilizando un token de refresco válido
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.refreshToken - Token de refresco para validar
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con nuevos tokens de acceso y refresco
 */
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Token de refresco requerido' });
    }

    // Verificar validez del token de refresco
    const decoded = jwt.verify(refreshToken, config.jwt.secret);
    
    // Buscar usuario en ambas colecciones
    const user = await User.findById(decoded.id) || await Doctor.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    // Generar nuevos tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Enviar nuevos tokens al cliente
    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({ message: 'Token de refresco inválido o expirado' });
  }
};

/**
 * @function getProfile
 * @description Obtiene el perfil completo del usuario autenticado
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.user - Usuario autenticado (inyectado por middleware auth)
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con datos del perfil de usuario
 */
const getProfile = async (req, res) => {
  try {
    const user = req.user;
    
    // Construir respuesta según tipo de usuario (médico o paciente)
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.constructor.modelName === 'Doctor' ? 'doctor' : user.role,
      phoneNumber: user.phoneNumber,
      // Incluir campos específicos para médicos cuando corresponda
      ...(user.constructor.modelName === 'Doctor' && {
        speciality: user.speciality,
        licenseNumber: user.licenseNumber
      })
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener perfil', error: error.message });
  }
};

/**
 * @function updateLoginAttempts
 * @description Actualiza el contador de intentos fallidos de login y establece
 * bloqueo temporal cuando se alcanza el límite configurado
 * 
 * @param {string} email - Email del usuario con intento fallido
 * @private
 */
const updateLoginAttempts = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
  attempts.count += 1;
  
  // Establecer bloqueo temporal si se alcanza o supera el límite
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = Date.now() + LOCK_TIME;
  }
  
  // Actualizar registro en el cache
  loginAttempts.set(email, attempts);
};

module.exports = {
  register,
  login,
  getProfile,
  refreshAccessToken
};