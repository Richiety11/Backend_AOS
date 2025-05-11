/**
 * Controlador optimizado para autenticación sin problemas de encabezados grandes.
 * Esta versión está diseñada para ser el único método de autenticación en la aplicación.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

// Cache para intentos fallidos de login
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos

/**
 * Genera un token JWT optimizado
 * @param {string} id - ID del usuario
 * @returns {string} Token JWT
 */
const generateToken = (id) => {
  return jwt.sign({ 
    sub: id.toString(),
    id: id.toString()  // Añadir también como 'id' para compatibilidad con middleware
  }, config.jwt.secret, {
    expiresIn: '24h',  // Token válido por 24 horas
    algorithm: 'HS256'
  });
};

/**
 * Login optimizado que evita el error 431 (Request Header Fields Too Large)
 * @param {Request} req - Express Request
 * @param {Response} res - Express Response
 */
const simpleLogin = async (req, res) => {
  try {
    // Obtener datos de forma segura
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
    const password = req.body.password ? String(req.body.password) : '';
    
    // Validación de entrada
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    // Verificar bloqueo por intentos fallidos
    const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil > Date.now()) {
      return res.status(429).json({ 
        message: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
        lockUntil: attempts.lockUntil
      });
    }
    
    // Buscar usuario
    let user = null;
    let isDoctor = false;
    
    // Primero buscar en usuarios regulares
    user = await User.findOne({ email }).select('_id password name role');
    
    // Si no hay resultado, buscar en doctores
    if (!user) {
      user = await Doctor.findOne({ email }).select('_id password name speciality');
      if (user) isDoctor = true;
    }
    
    // Si no hay usuario con este email
    if (!user) {
      updateLoginAttempts(email);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Verificar password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      updateLoginAttempts(email);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    
    // Éxito de login - resetear intentos fallidos
    loginAttempts.delete(email);

    // Generar token con información mínima
    const token = generateToken(user._id);
    
    // Limpiar y optimizar las cabeceras HTTP para evitar el error 431
    // Eliminar todas las cabeceras innecesarias
    const headersToRemove = [
      'X-Powered-By', 'ETag', 'Set-Cookie', 'Vary', 
      'Keep-Alive', 'Transfer-Encoding', 'X-Request-ID'
    ];
    
    headersToRemove.forEach(header => {
      res.removeHeader(header);
    });
    
    // Establecer explícitamente solo las cabeceras mínimas necesarias
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'close'); // Evitar conexiones persistentes que pudieran acumular cabeceras
    
    // Devolver solo la información esencial del usuario
    return res.status(200).json({
      token,
      user: {
        _id: user._id.toString(),
        name: user.name,
        role: isDoctor ? 'doctor' : (user.role || 'patient'),
        ...(isDoctor && { speciality: user.speciality })
      }
    });
  } catch (error) {
    console.error("Error en simple login:", error);
    res.status(500).json({ message: 'Error de autenticación' });
  }
};

/**
 * Registro optimizado para evitar el error 431 (Request Header Fields Too Large)
 * @param {Request} req - Express Request
 * @param {Response} res - Express Response
 */
const simpleRegister = async (req, res) => {
  try {
    // Obtener datos de forma segura con límites de tamaño
    const email = req.body.email ? String(req.body.email).trim().toLowerCase().slice(0, 50) : '';
    const password = req.body.password ? String(req.body.password) : '';
    const name = req.body.name ? String(req.body.name).trim().slice(0, 100) : '';
    const role = ['patient', 'doctor'].includes(req.body.role) ? req.body.role : 'patient';
    
    // Validación de entrada
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Datos incompletos. Nombre, email y contraseña son requeridos' });
    }
    
    // Verificar si el correo ya existe en cualquiera de las colecciones
    const existingUser = await User.findOne({ email });
    const existingDoctor = await Doctor.findOne({ email });
    
    if (existingUser || existingDoctor) {
      return res.status(409).json({ message: 'El correo electrónico ya está registrado' });
    }
    
    // Crear el usuario según el rol
    let user = null;
    
    if (role === 'doctor') {
      // Para doctores, necesitamos campos adicionales
      const speciality = req.body.speciality ? String(req.body.speciality).trim() : '';
      const licenseNumber = req.body.licenseNumber ? String(req.body.licenseNumber).trim() : '';
      
      if (!speciality || !licenseNumber) {
        return res.status(400).json({ message: 'Para registro de médicos, especialidad y número de licencia son requeridos' });
      }
      
      user = new Doctor({
        email,
        password,
        name,
        speciality,
        licenseNumber,
        phoneNumber: req.body.phoneNumber || ''
      });
    } else {
      // Usuario paciente
      user = new User({
        email,
        password,
        name,
        role: 'patient',
        phoneNumber: req.body.phoneNumber || ''
      });
    }
    
    // Guardar usuario
    await user.save();
    
    // Generar token con información mínima
    const token = generateToken(user._id);
    
    // Establecer headers explícitamente para evitar problemas
    res.removeHeader('X-Powered-By');
    res.removeHeader('ETag');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    
    // Enviar respuesta mínima
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
 * Actualiza los intentos fallidos de inicio de sesión
 * @param {string} email - Email del usuario
 */
const updateLoginAttempts = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
  attempts.count += 1;
  
  // Bloquear la cuenta después de alcanzar el límite de intentos
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = Date.now() + LOCK_TIME;
  }
  
  loginAttempts.set(email, attempts);
};

module.exports = {
  simpleLogin,
  simpleRegister
};
