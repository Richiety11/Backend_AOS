const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

// Cache para intentos fallidos de login
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos

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

const generateRefreshToken = (id) => {
  // Simplificar el refresh token
  return jwt.sign({ 
    sub: id.toString(),
    type: 'refresh'
  }, 
  config.jwt.secret, 
  {
    expiresIn: '7d',
    algorithm: 'HS256'
  });
};

const register = async (req, res) => {
  try {
    const { email, password, name, phoneNumber, role, speciality, licenseNumber } = req.body;

    // Verificar si el usuario ya existe
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    let user;
    if (role === 'doctor') {
      if (!speciality || !licenseNumber) {
        return res.status(400).json({ message: 'La especialidad y número de licencia son requeridos para médicos' });
      }
      user = new Doctor({ email, password, name, phoneNumber, speciality, licenseNumber });
    } else {
      user = new User({ email, password, name, phoneNumber, role: role || 'patient' });
    }

    await user.save();
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

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

const login = async (req, res) => {
  try {
    // Validar que se recibieron los campos necesarios
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'El correo y contraseña son requeridos' });
    }

    // Verificar bloqueo por intentos fallidos
    const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil > Date.now()) {
      return res.status(429).json({ 
        message: 'Cuenta temporalmente bloqueada por múltiples intentos fallidos',
        lockUntil: attempts.lockUntil
      });
    }

    // Buscar usuario en ambos modelos - con manejo de errores
    let user = null;
    let isDoctor = false;
    
    try {
      user = await User.findOne({ email }).select('+password');
    } catch (err) {
      console.error("Error buscando usuario:", err);
    }

    if (!user) {
      try {
        user = await Doctor.findOne({ email }).select('+password');
        if (user) isDoctor = true;
      } catch (err) {
        console.error("Error buscando doctor:", err);
      }
    }

    if (!user) {
      updateLoginAttempts(email);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Verificar password
    let isMatch = false;
    try {
      isMatch = await user.comparePassword(password);
    } catch (err) {
      console.error("Error comparando passwords:", err);
      return res.status(500).json({ message: 'Error al verificar credenciales' });
    }
    
    if (!isMatch) {
      updateLoginAttempts(email);
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Restablecer intentos fallidos al lograr login exitoso
    loginAttempts.delete(email);

    // Generar solo un token de acceso para reducir tamaño de respuesta
    const token = generateToken(user._id);
    // Solo generar refreshToken si el cliente lo solicita específicamente
    const refreshToken = req.query.withRefresh ? generateRefreshToken(user._id) : null;

    // Enviar respuesta mínima para reducir tamaño
    const userResponse = {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: isDoctor ? 'doctor' : user.role
    };
    
    // Información mínima para doctores
    if (isDoctor && user.speciality) {
      userResponse.speciality = user.speciality;
    }

    // Respuesta optimizada sin datos innecesarios
    const response = {
      token,
      user: userResponse
    };
    
    // Solo incluir refreshToken si se generó
    if (refreshToken) {
      response.refreshToken = refreshToken;
    }

    // Configurar headers para reducir tamaño
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(response);
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: 'Error al iniciar sesión' });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Token de refresco requerido' });
    }

    const decoded = jwt.verify(refreshToken, config.jwt.secret);
    const user = await User.findById(decoded.id) || await Doctor.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({ message: 'Token de refresco inválido o expirado' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = req.user;
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.constructor.modelName === 'Doctor' ? 'doctor' : user.role,
      phoneNumber: user.phoneNumber,
      ...(user.constructor.modelName === 'Doctor' && {
        speciality: user.speciality,
        licenseNumber: user.licenseNumber
      })
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener perfil', error: error.message });
  }
};

const updateLoginAttempts = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lockUntil: 0 };
  attempts.count += 1;
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = Date.now() + LOCK_TIME;
  }
  
  loginAttempts.set(email, attempts);
};

module.exports = {
  register,
  login,
  getProfile,
  refreshAccessToken
};