/**
 * @file appointment.model.js
 * @description Modelo de datos para las citas médicas del sistema.
 * Define la estructura, validaciones, restricciones y métodos asociados a las citas.
 * Incluye lógica avanzada de validación para garantizar la disponibilidad de los médicos
 * y el correcto espaciamiento entre citas.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const dayjs = require('dayjs');
// Importación de plugins necesarios para operaciones con fechas y horas
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isBetween = require('dayjs/plugin/isBetween');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const localeData = require('dayjs/plugin/localeData');

// Configuración de plugins para la manipulación avanzada de fechas
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(localeData);

/**
 * @typedef {Object} AppointmentSchema
 * @description Esquema de datos para citas médicas
 * 
 * @property {ObjectId} patient - Referencia al usuario (paciente) que agenda la cita
 * @property {ObjectId} doctor - Referencia al médico asignado para la cita
 * @property {Date} date - Fecha de la cita
 * @property {String} time - Hora de la cita en formato HH:MM
 * @property {String} status - Estado actual de la cita ['pending', 'confirmed', 'cancelled', 'completed', 'archived', 'no-show']
 * @property {Boolean} isArchived - Indica si la cita está archivada
 * @property {String} reason - Motivo o descripción de la cita
 * @property {String} notes - Notas adicionales sobre la cita o tratamiento
 * @property {Date} createdAt - Fecha de creación del registro
 * @property {Date} updatedAt - Fecha de última actualización del registro
 */
const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Referencia al modelo de usuarios (pacientes)
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor', // Referencia al modelo de médicos
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Validar que la hora tiene el formato correcto HH:MM
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'El formato de hora debe ser HH:mm'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'archived', 'no-show'],
    default: 'pending'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: [10, 'El motivo debe tener al menos 10 caracteres'],
    maxlength: [500, 'El motivo no puede exceder los 500 caracteres']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Las notas no pueden exceder los 1000 caracteres']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Habilita la creación automática de campos createdAt y updatedAt
});

/**
 * @description Índice compuesto para optimizar búsquedas y garantizar unicidad
 * Previene la programación de múltiples citas para el mismo médico, fecha y hora
 */
appointmentSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true });

/**
 * @method checkAvailability
 * @description Método estático para verificar la disponibilidad de un médico en una fecha y hora específicas.
 * Realiza múltiples validaciones:
 * 1. Existencia del médico en la base de datos
 * 2. Que la fecha no sea en el pasado
 * 3. Que la hora esté dentro del horario de atención
 * 4. Que la hora se ajuste a intervalos de 30 minutos
 * 5. Que el médico tenga disponibilidad en ese día/hora
 * 6. Que no haya citas existentes en ese horario
 * 7. Que haya suficiente espacio entre citas (mínimo 30 minutos)
 * 
 * @param {ObjectId} doctorId - ID del médico
 * @param {Date|String} date - Fecha de la cita
 * @param {String} time - Hora de la cita en formato HH:MM
 * @param {ObjectId} [appointmentId=null] - ID de la cita actual (para ediciones)
 * @returns {Promise<boolean>} Promesa que resuelve a true si la fecha/hora está disponible
 * @throws {Error} Si la fecha/hora solicitada no cumple con alguna validación
 */
appointmentSchema.statics.checkAvailability = async function(doctorId, date, time, appointmentId = null) {
  const Doctor = mongoose.model('Doctor');
  
  // Obtener información del médico
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new Error('Médico no encontrado');
  }

  // Procesamiento y normalización de fechas para garantizar consistencia
  // Independiente del formato de entrada (string o Date)
  let dateOnly;
  if (typeof date === 'string') {
    dateOnly = date.includes('T') ? date.split('T')[0] : date;
  } else if (date instanceof Date) {
    dateOnly = date.toISOString().split('T')[0];
  } else {
    // Convertir otro tipo a string
    dateOnly = String(date);
  }
  
  // Creación de objetos dayjs para manipulación de fechas/horas
  const appointmentDate = dayjs(dateOnly);
  const appointmentTime = dayjs(time, 'HH:mm');
  const dayOfWeek = appointmentDate.format('dddd').toLowerCase();
  
  // Validación 1: Fecha no puede ser en el pasado
  if (appointmentDate.isBefore(dayjs().startOf('day'))) {
    throw new Error('No se pueden agendar citas en fechas pasadas');
  }

  // Validación 2: Hora dentro del horario de atención (8:00-17:00)
  const appointmentHour = parseInt(time.split(':')[0]);
  const appointmentMinute = parseInt(time.split(':')[1]);
  
  if (appointmentHour < 8 || appointmentHour >= 17) {
    throw new Error('El horario de atención es de 8:00 AM a 5:00 PM');
  }

  // Validación 3: Citas deben ser en intervalos de 30 minutos
  if (appointmentMinute % 30 !== 0) {
    throw new Error('Las citas deben programarse en intervalos de 30 minutos');
  }
  
  // Validación 4: No permitir citas después de las 5:00 PM
  if (appointmentHour === 17 && appointmentMinute > 0) {
    throw new Error('La última cita disponible es a las 5:00 PM');
  }

  // Validación 5: El médico debe tener disponibilidad para ese día/hora
  const availableSlot = doctor.availability.find(slot => {
    // Convertir a horas y minutos para comparación más sencilla
    const apptHour = parseInt(time.split(':')[0]);
    const apptMinute = parseInt(time.split(':')[1]);
    const startHour = parseInt(slot.startTime.split(':')[0]);
    const startMinute = parseInt(slot.startTime.split(':')[1]);
    const endHour = parseInt(slot.endTime.split(':')[0]);
    const endMinute = parseInt(slot.endTime.split(':')[1]);
    
    // Convertir todo a minutos desde el inicio del día para facilitar la comparación
    const apptTimeInMinutes = (apptHour * 60) + apptMinute;
    const startTimeInMinutes = (startHour * 60) + startMinute;
    const endTimeInMinutes = (endHour * 60) + endMinute;
    
    // Verificar que el día coincide y que la hora está dentro del rango disponible
    return slot.day === dayOfWeek &&
           apptTimeInMinutes >= startTimeInMinutes &&
           apptTimeInMinutes < endTimeInMinutes;
  });

  if (!availableSlot) {
    throw new Error('El médico no tiene disponibilidad en este horario');
  }

  // Validación 6: No debe existir otra cita para el mismo médico, fecha y hora
  const existingAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    time: time,
    status: { $nin: ['cancelled'] }, // Excluir citas canceladas
    _id: { $ne: appointmentId } // Excluir la cita actual en caso de edición
  });

  if (existingAppointment) {
    throw new Error('Ya existe una cita agendada en este horario');
  }

  // Validación 7: Debe haber al menos 30 minutos entre citas
  const previousAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    status: { $nin: ['cancelled'] },
    time: { $lt: time },
    _id: { $ne: appointmentId }
  }).sort({ time: -1 }); // Obtener la cita previa más cercana

  const nextAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    status: { $nin: ['cancelled'] },
    time: { $gt: time },
    _id: { $ne: appointmentId }
  }).sort({ time: 1 }); // Obtener la cita siguiente más cercana

  // Verificar espacio con la cita previa
  if (previousAppointment) {
    const prevTime = dayjs(previousAppointment.time, 'HH:mm');
    const timeDiff = appointmentTime.diff(prevTime, 'minute');
    if (timeDiff < 30) {
      throw new Error('Debe haber al menos 30 minutos entre citas');
    }
  }

  // Verificar espacio con la cita siguiente
  if (nextAppointment) {
    const nextTime = dayjs(nextAppointment.time, 'HH:mm');
    const timeDiff = nextTime.diff(appointmentTime, 'minute');
    if (timeDiff < 30) {
      throw new Error('Debe haber al menos 30 minutos entre citas');
    }
  }

  // Si todas las validaciones pasan, la fecha/hora está disponible
  return true;
};

/**
 * @function pre-save
 * @description Middleware que se ejecuta antes de guardar una cita.
 * Verifica la disponibilidad del médico utilizando el método checkAvailability
 * cuando se crea o modifica una cita.
 */
appointmentSchema.pre('save', async function(next) {
  try {
    // Solo validar disponibilidad si se modifica fecha, hora o médico
    if (this.isModified('date') || this.isModified('time') || this.isModified('doctor')) {
      await this.constructor.checkAvailability(this.doctor, this.date, this.time, this._id);
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Appointment', appointmentSchema);