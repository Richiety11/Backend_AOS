const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

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
  _id: false
});

// Validación personalizada para verificar que endTime sea posterior a startTime
availabilitySchema.pre('validate', function(next) {
  if (this.startTime && this.endTime) {
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
      this.invalidate('endTime', 'La hora de fin debe ser posterior a la hora de inicio');
    }
    
    // Validar horario de atención (8:00 - 17:00)
    if (startHour < 8 || endHour > 17) {
      this.invalidate('startTime', 'El horario de atención debe estar entre 8:00 y 17:00');
    }
  }
  next();
});

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
        // Verificar que no haya días duplicados
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
  timestamps: true
});

// Middleware para hashear la contraseña antes de guardar
doctorSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
doctorSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Doctor', doctorSchema);