/**
 * @file doctor.model.js
 * @description Modelo de datos para los médicos del sistema de citas médicas.
 * Define la estructura, validaciones, restricciones y métodos asociados a los perfiles médicos.
 * Incluye esquema de disponibilidad horaria y validaciones complejas para horarios de atención.
 * @autor Equipo de Desarrollo
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * @constant {RegExp} timeRegex - Expresión regular para validar formato de hora (HH:MM)
 */
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * @typedef {Object} AvailabilitySchema
 * @description Esquema para la disponibilidad horaria de los médicos
 * 
 * @property {String} day - Día de la semana (enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
 * @property {String} startTime - Hora de inicio de atención en formato HH:MM
 * @property {String} endTime - Hora de fin de atención en formato HH:MM
 */
const availabilitySchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: [true, 'El día es requerido']
  },
  startTime: {
    type: String,
    required: [true, 'La hora de inicio es requerida'],
    validate: {
      validator: function(v) {
        return timeRegex.test(v);
      },
      message: 'La hora de inicio debe estar en formato HH:mm'
    }
  },
  endTime: {
    type: String,
    required: [true, 'La hora de fin es requerida'],
    validate: {
      validator: function(v) {
        return timeRegex.test(v);
      },
      message: 'La hora de fin debe estar en formato HH:mm'
    }
  }
}, {
  _id: false // No generar _id para estos subdocumentos
});

/**
 * @function pre-validate (availabilitySchema)
 * @description Middleware de validación para los horarios de disponibilidad.
 * Verifica que:
 * 1. La hora de fin sea posterior a la hora de inicio
 * 2. Los horarios estén dentro del rango permitido (8:00-17:00)
 */
availabilitySchema.pre('validate', function(next) {
  if (this.startTime && this.endTime) {
    // Convertir las cadenas de hora a componentes numéricos
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    // Validar que la hora de fin sea posterior a la de inicio
    if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
      this.invalidate('endTime', 'La hora de fin debe ser posterior a la hora de inicio');
    }
    
    // Validar que los horarios estén dentro del rango de atención establecido
    if (startHour < 8 || endHour > 17) {
      this.invalidate('startTime', 'El horario de atención debe estar entre 8:00 y 17:00');
    }
  }
  next();
});

/**
 * @typedef {Object} DoctorSchema
 * @description Esquema de datos para médicos del sistema
 * 
 * @property {String} email - Correo electrónico único del médico (requerido)
 * @property {String} password - Contraseña del médico, almacenada con hash (requerido)
 * @property {String} name - Nombre completo del médico (requerido)
 * @property {String} speciality - Especialidad médica (requerido)
 * @property {String} licenseNumber - Número de licencia médica, debe ser único (requerido)
 * @property {Array<AvailabilitySchema>} availability - Horarios de disponibilidad del médico
 * @property {String} phoneNumber - Número telefónico de contacto (requerido)
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización del registro (generado por timestamps)
 */
const doctorSchema = new mongoose.Schema({
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
  speciality: {
    type: String,
    required: true,
    trim: true
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  availability: {
    type: [availabilitySchema],
    validate: {
      validator: function(availability) {
        // Verificar que no haya días duplicados en la disponibilidad
        const days = availability.map(slot => slot.day);
        return days.length === new Set(days).size;
      },
      message: 'No puede haber días duplicados en la disponibilidad'
    }
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
doctorSchema.pre('save', async function(next) {
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
doctorSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Doctor', doctorSchema);