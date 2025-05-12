/**
 * @file simple-auth.controller.js
 * @description Controlador optimizado para autenticación que evita problemas de encabezados HTTP grandes.
 * Este módulo proporciona implementaciones de login y registro que minimizan el tamaño de las respuestas HTTP
 * para prevenir errores 431 (Request Header Fields Too Large), e incluye mecanismos
 * de seguridad como bloqueo temporal ante intentos fallidos de inicio de sesión.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

/**
 * @const {Map} loginAttempts - Cache en memoria para seguimiento de intentos fallidos de login
 * Almacena por cada email: {count: número de intentos, lockUntil: timestamp de desbloqueo}
 */
const loginAttempts = new Map();

/**
 * @const {number} MAX_LOGIN_ATTEMPTS - Número máximo de intentos fallidos antes del bloqueo
 */
const MAX_LOGIN_ATTEMPTS = 5;

/**
 * @const {number} LOCK_TIME - Tiempo de bloqueo tras alcanzar el máximo de intentos (15 minutos en ms)
 */
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos

/**
 * @function generateToken
 * @description Genera un token JWT optimizado con payload mínimo
 * 
 * @param {string} id - ID del usuario
 * @returns {string} Token JWT firmado
 */
const generateToken = (id) => {
  return jwt.sign({ 
    sub: id.toString(),
    id: id.toString()  // Añadir también como 'id' para compatibilidad con middleware
  }, config.jwt.secret, {
    expiresIn: '24h',  // Token válido por 24 horas
    algorithm: 'HS256'  // Algoritmo de firma eficiente
  });
};

/**
 * @function simpleLogin
 * @description Endpoint de inicio de sesión optimizado que evita el error 431
 * (Request Header Fields Too Large) minimizando las cabeceras HTTP y la carga útil.
 * Incluye protección contra ataques de fuerza bruta mediante bloqueo temporal.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Cuerpo de la solicitud
 * @param {string} req.body.email - Correo electrónico del usuario
 * @param {string} req.body.password - Contraseña del usuario
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con token y datos mínimos de usuario o mensaje de error
 */
const simpleLogin = async (req, res) => {
  try {
    // Obtención y sanitización de datos de entrada
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    const password = req.body.password ? String(req.body.password) : '';
    
    // Validación básica de entrada
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    // Sistema de protección contra ataques de fuerza bruta:
    // Verificar si la cuenta está temporalmente bloqueada por intentos fallidos previos
    const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil > Date.now()) {
      return res.status(429).json({ 
        message: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
        lockUntil: attempts.lockUntil
      });
    }
    
    // Proceso de búsqueda de usuario en múltiples colecciones
    let user = null;
    let isDoctor = false;
    
    // Primero buscar en usuarios regulares (pacientes)
    user = await User.findOne({ email }).select('_id password name role');
    
    // Si no hay resultado en usuarios regulares, buscar en médicos
    if (!user) {
      user = await Doctor.findOne({ email }).select('_id password name speciality');
      if (user) isDoctor = true;
    }
    
    // Si no existe ningún usuario con ese email
    if (!user) {
      updateLoginAttempts(email); // Incrementa contador de intentos fallidos
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Verificar contraseña utilizando el método definido en el modelo
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      updateLoginAttempts(email); // Incrementa contador de intentos fallidos
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    
    // Éxito de login - resetear intentos fallidos
    loginAttempts.delete(email);

    // Generar token con información mínima necesaria
    const token = generateToken(user._id);
    
    // Optimización de cabeceras HTTP para evitar el error 431
    // Eliminar todas las cabeceras innecesarias que podrían aumentar el tamaño de la respuesta
    const headersToRemove = [
      'X-Powered-By', 'ETag', 'Set-Cookie', 'Vary', 
      'Keep-Alive', 'Transfer-Encoding', 'X-Request-ID'
    ];
    
    headersToRemove.forEach(header => {
      res.removeHeader(header);
    });
    
    // Establecer explícitamente solo las cabeceras mínimas necesarias
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store'); // Prevenir el cacheo del token por seguridad
    res.setHeader('Connection', 'close'); // Evitar conexiones persistentes que pudieran acumular cabeceras
    
    // Devolver solo la información esencial del usuario para minimizar tamaño de respuesta
    return res.status(200).json({
      token,
      user: {
        _id: user._id.toString(),
        name: user.name,
        role: isDoctor ? 'doctor' : (user.role || 'patient'),
        ...(isDoctor && { speciality: user.speciality }) // Incluir especialidad solo si es médico
      }
    });
  } catch (error) {
    console.error("Error en simple login:", error);
    res.status(500).json({ message: 'Error de autenticación' });
  }
};

/**
 * @function simpleRegister
 * @description Endpoint de registro optimizado que evita el error 431
 * (Request Header Fields Too Large) minimizando las cabeceras HTTP y la carga útil.
 * Permite crear tanto usuarios pacientes como médicos.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Cuerpo de la solicitud con datos de registro
 * @param {string} req.body.email - Correo electrónico del nuevo usuario
 * @param {string} req.body.password - Contraseña del nuevo usuario
 * @param {string} req.body.name - Nombre completo del nuevo usuario
 * @param {string} [req.body.role='patient'] - Rol del usuario ('patient' o 'doctor')
 * @param {string} [req.body.speciality] - Especialidad médica (requerido si role='doctor')
 * @param {string} [req.body.licenseNumber] - Número de licencia médica (requerido si role='doctor')
 * @param {string} [req.body.phoneNumber] - Número telefónico del usuario
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con token y datos mínimos de usuario creado o mensaje de error
 */
const simpleRegister = async (req, res) => {
  try {
    // Obtención y sanitización de datos de entrada con límites de tamaño
    const email = req.body.email ? String(req.body.email).trim().toLowerCase().slice(0, 50) : '';
    const password = req.body.password ? String(req.body.password) : '';
    const name = req.body.name ? String(req.body.name).trim().slice(0, 100) : '';
    const role = ['patient', 'doctor'].includes(req.body.role) ? req.body.role : 'patient';
    
    // Validación básica de entrada
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Datos incompletos. Nombre, email y contraseña son requeridos' });
    }
    
    // Verificación de duplicidad: comprobar si el correo ya existe en cualquiera de las colecciones
    const existingUser = await User.findOne({ email });
    const existingDoctor = await Doctor.findOne({ email });
    
    if (existingUser || existingDoctor) {
      return res.status(409).json({ message: 'El correo electrónico ya está registrado' });
    }
    
    // Crear el usuario según el rol especificado
    let user = null;
    
    if (role === 'doctor') {
      // Campos adicionales requeridos para médicos
      const speciality = req.body.speciality ? String(req.body.speciality).trim() : '';
      const licenseNumber = req.body.licenseNumber ? String(req.body.licenseNumber).trim() : '';
      
      // Validación específica para médicos
      if (!speciality || !licenseNumber) {
        return res.status(400).json({ message: 'Para registro de médicos, especialidad y número de licencia son requeridos' });
      }
      
      // Crear instancia del modelo Doctor
      user = new Doctor({
        email,
        password,
        name,
        speciality,
        licenseNumber,
        phoneNumber: req.body.phoneNumber || ''
      });
    } else {
      // Crear instancia del modelo User (paciente)
      user = new User({
        email,
        password,
        name,
        role: 'patient',
        phoneNumber: req.body.phoneNumber || ''
      });
    }
    
    // Guardar el nuevo usuario en la base de datos
    // El hash de contraseña se realiza en el middleware pre-save del modelo
    await user.save();
    
    // Generar token con información mínima
    const token = generateToken(user._id);
    
    // Optimización de cabeceras HTTP para minimizar tamaño
    res.removeHeader('X-Powered-By');
    res.removeHeader('ETag');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    
    // Respuesta minimalista con solo los datos esenciales
    return res.status(201).json({
      token,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: role
      }
    });
  } catch (error) {
    console.error("Error en simple register:", error);
    res.status(500).json({ message: 'Error de registro', error: error.message });
  }
};

/**
 * @function updateLoginAttempts
 * @description Actualiza el contador de intentos fallidos de inicio de sesión
 * y establece bloqueo temporal cuando se alcanzan los intentos máximos.
 * 
 * @param {string} email - Email del usuario que intenta iniciar sesión
 * @private
 */
const updateLoginAttempts = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
  attempts.count += 1;
  
  // Aplicar bloqueo temporal si se alcanza o supera el límite de intentos
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = Date.now() + LOCK_TIME;
  }
  
  // Actualizar el registro en el cache
  loginAttempts.set(email, attempts);
};

module.exports = {
  simpleLogin,
  simpleRegister
};
