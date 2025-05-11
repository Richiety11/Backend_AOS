const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { logger } = require('../config/config');

dayjs.extend(utc);
dayjs.extend(timezone);

const createAppointment = async (req, res) => {
  try {
    const { doctorId, date, time, reason } = req.body;
    logger.info('Intento de creación de cita', {
      userId: req.user._id,
      doctorId,
      date,
      time
    });
    
    // Validaciones básicas
    if (!doctorId || !date || !time || !reason) {
      logger.warn('Datos incompletos en creación de cita', {
        userId: req.user._id,
        missing: {
          doctorId: !doctorId,
          date: !date,
          time: !time,
          reason: !reason
        }
      });
      return res.status(400).json({ 
        message: 'Faltan campos requeridos',
        details: {
          doctorId: !doctorId ? 'El ID del médico es requerido' : null,
          date: !date ? 'La fecha es requerida' : null,
          time: !time ? 'La hora es requerida' : null,
          reason: !reason ? 'El motivo es requerido' : null
        }
      });
    }
    
    // Verificar si el usuario es un médico y solo puede agendar citas para sí mismo
    if (req.user.constructor.modelName === 'Doctor' && req.user._id.toString() !== doctorId) {
      logger.warn('Médico intentando agendar cita para otro médico', {
        doctorId: req.user._id,
        targetDoctorId: doctorId
      });
      return res.status(403).json({ 
        message: 'Los médicos solo pueden agendar citas para sí mismos',
      });
    }

    // Validar formato de fecha y hora
    const dateObj = dayjs(date);
    if (!dateObj.isValid()) {
      logger.warn('Formato de fecha inválido', { date, userId: req.user._id });
      return res.status(400).json({ message: 'Formato de fecha inválido' });
    }

    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      logger.warn('Formato de hora inválido', { time, userId: req.user._id });
      return res.status(400).json({ message: 'Formato de hora inválido. Use HH:mm' });
    }

    try {
      await Appointment.checkAvailability(doctorId, date, time);
    } catch (availabilityError) {
      logger.warn('Error de disponibilidad', {
        error: availabilityError.message,
        userId: req.user._id,
        doctorId,
        date,
        time
      });
      return res.status(400).json({ 
        message: 'Error de disponibilidad',
        details: availabilityError.message
      });
    }

    const appointment = new Appointment({
      patient: req.user._id,
      doctor: doctorId,
      date,
      time,
      reason: reason.trim()
    });

    await appointment.save();
    logger.info('Cita creada exitosamente', {
      appointmentId: appointment._id,
      userId: req.user._id,
      doctorId
    });

    res.status(201).json({
      message: 'Cita agendada exitosamente',
      appointment: await appointment.populate(['patient', {
        path: 'doctor',
        select: 'name email speciality licenseNumber'
      }])
    });
  } catch (error) {
    logger.error('Error al crear cita', {
      error: error.message,
      userId: req.user._id,
      stack: error.stack
    });
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ 
      message: 'Error al crear la cita', 
      details: error.message 
    });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, reason, status, notes } = req.body;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    // Verificar permisos
    const isDoctor = req.user.constructor.modelName === 'Doctor';
    const isPatient = appointment.patient.toString() === req.user._id.toString();
    const isOwner = isDoctor ? appointment.doctor.toString() === req.user._id.toString() : isPatient;

    if (!isOwner) {
      return res.status(403).json({ message: 'No autorizado para modificar esta cita' });
    }

    // Validar si la cita puede ser modificada
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'No se puede modificar una cita cancelada' });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ message: 'No se puede modificar una cita completada' });
    }

    // Si se está actualizando la fecha o la hora, verificar disponibilidad
    if ((date && date !== appointment.date.toISOString().split('T')[0]) || 
        (time && time !== appointment.time)) {
      try {
        await Appointment.checkAvailability(
          appointment.doctor, 
          date || appointment.date, 
          time || appointment.time,
          appointment._id
        );
      } catch (availabilityError) {
        return res.status(400).json({ 
          message: 'Error de disponibilidad',
          details: availabilityError.message
        });
      }
    }

    // Actualizar campos
    if (date) appointment.date = date;
    if (time) appointment.time = time;
    if (reason) appointment.reason = reason.trim();
    if (status && isDoctor) appointment.status = status;
    if (notes) appointment.notes = notes.trim();

    await appointment.save();

    res.json({
      message: 'Cita actualizada exitosamente',
      appointment: await appointment.populate(['patient', {
        path: 'doctor',
        select: 'name email speciality licenseNumber'
      }])
    });
  } catch (error) {
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ 
      message: 'Error al actualizar la cita', 
      details: error.message 
    });
  }
};

const getAppointments = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const query = {};

    // Filtrar por rol
    if (req.user.constructor.modelName === 'Doctor') {
      query.doctor = req.user._id;
    } else {
      query.patient = req.user._id;
    }

    // Filtros adicionales
    if (status) query.status = status;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const appointments = await Appointment.find(query)
      .populate(['patient', 'doctor'])
      .sort({ date: 1, time: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener las citas', error: error.message });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id)
      .populate(['patient', 'doctor']);

    if (!appointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    // Verificar permisos
    const isDoctor = req.user.constructor.modelName === 'Doctor';
    const isPatient = appointment.patient._id.toString() === req.user._id.toString();
    const isAuthorized = isDoctor ? 
      appointment.doctor._id.toString() === req.user._id.toString() : 
      isPatient;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'No autorizado para ver esta cita' });
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la cita', error: error.message });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    // Verificar permisos
    const isDoctor = req.user.constructor.modelName === 'Doctor';
    const isPatient = appointment.patient.toString() === req.user._id.toString();
    const isOwner = isDoctor ? 
      appointment.doctor.toString() === req.user._id.toString() : 
      isPatient;

    if (!isOwner) {
      return res.status(403).json({ message: 'No autorizado para cancelar esta cita' });
    }

    // Verificar si la cita puede ser cancelada
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'La cita ya está cancelada' });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ message: 'No se puede cancelar una cita completada' });
    }

    // Si la cita es para hoy o ya pasó, solo el médico puede cancelarla
    const today = dayjs().startOf('day');
    const appointmentDate = dayjs(appointment.date).startOf('day');
    if (!isDoctor && appointmentDate.isSameOrBefore(today)) {
      return res.status(403).json({ 
        message: 'Las citas del día actual o pasadas solo pueden ser canceladas por el médico' 
      });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    res.json({
      message: 'Cita cancelada exitosamente',
      appointment: await appointment.populate(['patient', {
        path: 'doctor',
        select: 'name email speciality licenseNumber'
      }])
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al cancelar la cita', 
      details: error.message 
    });
  }
};

module.exports = {
  createAppointment,
  updateAppointment,
  getAppointments,
  getAppointmentById,
  cancelAppointment
};