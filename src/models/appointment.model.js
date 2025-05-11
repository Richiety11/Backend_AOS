const mongoose = require('mongoose');
const dayjs = require('dayjs');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isBetween = require('dayjs/plugin/isBetween');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const localeData = require('dayjs/plugin/localeData');

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(localeData);

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
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
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'El formato de hora debe ser HH:mm'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
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
  timestamps: true
});

// Índice compuesto para evitar citas duplicadas
appointmentSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true });

// Método para verificar disponibilidad
appointmentSchema.statics.checkAvailability = async function(doctorId, date, time, appointmentId = null) {
  const Doctor = mongoose.model('Doctor');
  const doctor = await Doctor.findById(doctorId);
  
  if (!doctor) {
    throw new Error('Médico no encontrado');
  }

  // Convertir la fecha a objeto dayjs y garantizar que usamos la fecha local
  // sin ninguna transformación de zona horaria que pueda afectar el día de la semana
  let dateOnly;
  if (typeof date === 'string') {
    dateOnly = date.includes('T') ? date.split('T')[0] : date;
  } else if (date instanceof Date) {
    dateOnly = date.toISOString().split('T')[0];
  } else {
    // Si es otro tipo, convertirlo a string
    dateOnly = String(date);
  }
  
  const appointmentDate = dayjs(dateOnly);
  const appointmentTime = dayjs(time, 'HH:mm');
  const dayOfWeek = appointmentDate.format('dddd').toLowerCase();
  
  // Verificar que la fecha no sea en el pasado
  if (appointmentDate.isBefore(dayjs().startOf('day'))) {
    throw new Error('No se pueden agendar citas en fechas pasadas');
  }

  // Verificar que la hora esté dentro del horario de atención (8:00 AM - 5:00 PM)
  const appointmentHour = parseInt(time.split(':')[0]);
  const appointmentMinute = parseInt(time.split(':')[1]);
  
  if (appointmentHour < 8 || appointmentHour >= 17) {
    throw new Error('El horario de atención es de 8:00 AM a 5:00 PM');
  }

  // Verificar que los minutos sean múltiplos de 30
  if (appointmentMinute % 30 !== 0) {
    throw new Error('Las citas deben programarse en intervalos de 30 minutos');
  }
  
  // Verificar la hora final (no puede ser después de las 5pm)
  if (appointmentHour === 17 && appointmentMinute > 0) {
    throw new Error('La última cita disponible es a las 5:00 PM');
  }

  // Verificar disponibilidad del médico para ese día
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

  // Verificar que no haya otra cita en el mismo horario
  const existingAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    time: time,
    status: { $nin: ['cancelled'] },
    _id: { $ne: appointmentId } // Excluir la cita actual en caso de edición
  });

  if (existingAppointment) {
    throw new Error('Ya existe una cita agendada en este horario');
  }

  // Verificar que haya suficiente tiempo entre citas (mínimo 30 minutos)
  const previousAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    status: { $nin: ['cancelled'] },
    time: { $lt: time },
    _id: { $ne: appointmentId }
  }).sort({ time: -1 });

  const nextAppointment = await this.findOne({
    doctor: doctorId,
    date: date,
    status: { $nin: ['cancelled'] },
    time: { $gt: time },
    _id: { $ne: appointmentId }
  }).sort({ time: 1 });

  if (previousAppointment) {
    const prevTime = dayjs(previousAppointment.time, 'HH:mm');
    const timeDiff = appointmentTime.diff(prevTime, 'minute');
    if (timeDiff < 30) {
      throw new Error('Debe haber al menos 30 minutos entre citas');
    }
  }

  if (nextAppointment) {
    const nextTime = dayjs(nextAppointment.time, 'HH:mm');
    const timeDiff = nextTime.diff(appointmentTime, 'minute');
    if (timeDiff < 30) {
      throw new Error('Debe haber al menos 30 minutos entre citas');
    }
  }

  return true;
};

// Middleware para validar disponibilidad antes de guardar
appointmentSchema.pre('save', async function(next) {
  try {
    if (this.isModified('date') || this.isModified('time') || this.isModified('doctor')) {
      await this.constructor.checkAvailability(this.doctor, this.date, this.time, this._id);
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Appointment', appointmentSchema);