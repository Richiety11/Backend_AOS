/**
 * @file user.model.js
 * @description Modelo de datos para los usuarios (pacientes) del sistema de citas médicas.
 * Define la estructura, validaciones, restricciones y métodos asociados a los usuarios.
 * Incluye funcionalidades para la gestión segura de contraseñas mediante hashing.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * @typedef {Object} UserSchema
 * @description Esquema de datos para usuarios (pacientes) del sistema
 * 
 * @property {String} email - Correo electrónico único del usuario (requerido)
 * @property {String} password - Contraseña del usuario, almacenada con hash (requerido)
 * @property {String} name - Nombre completo del usuario (requerido)
 * @property {String} role - Rol del usuario ['patient', 'admin'] (por defecto: 'patient')
 * @property {String} phoneNumber - Número telefónico de contacto (requerido)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización del registro (generado por timestamps)
 */
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['patient', 'admin'],
    default: 'patient'
  },
  phoneNumber: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Habilita la creación automática de campos createdAt y updatedAt
});

/**
 * @function pre-save
 * @description Middleware que se ejecuta antes de guardar un documento.
 * Genera un hash seguro de la contraseña utilizando bcrypt si ésta ha sido modificada.
 * Utiliza un factor de costo (salt) de 10 para equilibrar seguridad y rendimiento.
 */
userSchema.pre('save', async function(next) {
  // Solo hashear la contraseña si ha sido modificada (o es nueva)
  if (!this.isModified('password')) return next();
  
  try {
    // Generar un salt aleatorio con factor de costo 10
    const salt = await bcrypt.genSalt(10);
    // Crear hash de la contraseña con el salt generado
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * @method comparePassword
 * @description Método para verificar si una contraseña proporcionada coincide con la almacenada.
 * Utiliza bcrypt para comparar la contraseña en texto plano con el hash almacenado.
 * 
 * @param {string} candidatePassword - Contraseña en texto plano a verificar
 * @returns {Promise<boolean>} Promesa que resuelve a true si la contraseña coincide, false en caso contrario
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);