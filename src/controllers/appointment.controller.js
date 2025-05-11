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
    const { doctorId, date, time, reason, patientId } = req.body;
    logger.info('Intento de creación de cita', {
      userId: req.user._id,
      doctorId,
      date,
      time,
      patientId
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
    
    // Verificar si el usuario es un médico y está intentando crear una cita para otro médico
    if (req.user.constructor.modelName === 'Doctor' && req.user._id.toString() !== doctorId) {
      logger.warn('Médico intentando agendar cita para otro médico', {
        doctorId: req.user._id,
        targetDoctorId: doctorId
      });
      return res.status(403).json({ 
        message: 'Los médicos solo pueden agendar citas para sí mismos',
      });
    }
    
    // Si es un doctor creando una cita, debe especificar para qué paciente
    let actualPatientId = req.user._id;
    if (req.user.constructor.modelName === 'Doctor') {
      if (!patientId) {
        logger.warn('Doctor intentando crear cita sin especificar paciente', {
          doctorId: req.user._id
        });
        return res.status(400).json({
          message: 'Debe seleccionar un paciente para la cita'
        });
      }
      actualPatientId = patientId;
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
      patient: actualPatientId,
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
    
    // Solo el doctor puede cambiar el estado de pendiente a confirmado o cancelado
    if (status && isDoctor) {
      // Validar las transiciones de estados permitidas
      if (appointment.status === 'pending' && (status === 'confirmed' || status === 'cancelled')) {
        appointment.status = status;
      } else if (appointment.status === 'confirmed') {
        // Si la cita ya ocurrió, se puede marcar como completada o cancelada
        const appointmentDate = dayjs(`${appointment.date.toISOString().split('T')[0]}T${appointment.time}`);
        const now = dayjs();
        
        if (now.isAfter(appointmentDate) && (status === 'completed' || status === 'cancelled' || status === 'no-show')) {
          appointment.status = status;
          // Si se marca como completada, cancelada o no tomada, se archiva automáticamente
          if (status === 'completed' || status === 'cancelled' || status === 'no-show') {
            appointment.isArchived = true;
          }
        } else if (!now.isAfter(appointmentDate) && status === 'cancelled') {
          appointment.status = status;
        } else {
          return res.status(400).json({ 
            message: 'Cambio de estado no permitido',
            details: 'Las transiciones de estado permitidas son: pendiente → confirmado/cancelado, confirmado → completado/cancelado (después de la fecha)'
          });
        }
      } else {
        return res.status(400).json({ 
          message: 'Cambio de estado no permitido',
          details: 'Las transiciones de estado permitidas son: pendiente → confirmado/cancelado, confirmado → completado/cancelado (después de la fecha)'
        });
      }
    } else if (status && !isDoctor) {
      return res.status(403).json({ 
        message: 'Solo el médico puede cambiar el estado de la cita'
      });
    }
    
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
    const query = {
      // Excluir citas archivadas por defecto
      isArchived: { $ne: true }
    };

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

const getArchivedAppointments = async (req, res) => {
  try {
    const { patientId } = req.query;
    const query = { isArchived: true };

    // Filtrar por rol
    if (req.user.constructor.modelName === 'Doctor') {
      query.doctor = req.user._id;
      
      // Si es doctor y ha solicitado filtrar por paciente
      if (patientId) {
        query.patient = patientId;
      }
    } else {
      // Si es paciente, solo puede ver sus propias citas
      query.patient = req.user._id;
    }

    const appointments = await Appointment.find(query)
      .populate(['patient', 'doctor'])
      .sort({ date: -1, time: -1 }); // Ordenadas desde la más reciente

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener las citas archivadas', 
      error: error.message 
    });
  }
};

const archiveAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    // Solo el doctor puede archivar una cita
    if (req.user.constructor.modelName !== 'Doctor' || appointment.doctor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'No autorizado para archivar esta cita' });
    }

    // Solo se pueden archivar las citas completadas, canceladas o no tomadas
    if (appointment.status !== 'completed' && appointment.status !== 'cancelled' && appointment.status !== 'no-show') {
      return res.status(400).json({ 
        message: 'Solo se pueden archivar las citas completadas, canceladas o no tomadas'
      });
    }

    appointment.isArchived = true;
    await appointment.save();

    res.json({
      message: 'Cita archivada exitosamente',
      appointment: await appointment.populate(['patient', {
        path: 'doctor',
        select: 'name email speciality licenseNumber'
      }])
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al archivar la cita', 
      details: error.message 
    });
  }
};

// Método para verificar y actualizar automáticamente el estado de las citas pasadas
const updatePastAppointments = async () => {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Encontrar todas las citas confirmadas de fechas pasadas que no han sido actualizadas
    const pastAppointments = await Appointment.find({
      status: 'confirmed',
      date: { $lt: yesterday },
      isArchived: false
    });
    
    for (const appointment of pastAppointments) {
      // Marcar como completada y archivar
      appointment.status = 'completed';
      appointment.isArchived = true;
      await appointment.save();
      logger.info(`Cita ID ${appointment._id} actualizada automáticamente a estado completado y archivada`);
    }
    
    return pastAppointments.length;
  } catch (error) {
    logger.error('Error al actualizar citas pasadas:', error);
    return 0;
  }
};

// Esta función podría ser llamada por un cron job o al iniciar el servidor
const initAppointmentStatusScheduler = () => {
  // Actualizar citas al iniciar
  updatePastAppointments();
  
  // Programar la actualización diaria (por ejemplo, a la 1:00 AM)
  const millisecondsUntilNextRun = (() => {
    const now = new Date();
    const scheduledTime = new Date(now);
    scheduledTime.setHours(1, 0, 0, 0);
    
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    return scheduledTime.getTime() - now.getTime();
  })();
  
  // Programar la primera ejecución
  setTimeout(() => {
    updatePastAppointments();
    
    // Configurar ejecución diaria después de la primera ejecución
    setInterval(updatePastAppointments, 24 * 60 * 60 * 1000);
  }, millisecondsUntilNextRun);
  
  logger.info(`Programador de actualización de estados de citas iniciado. Primera ejecución en ${millisecondsUntilNextRun} ms`);
};

module.exports = {
  createAppointment,
  updateAppointment,
  getAppointments,
  getAppointmentById,
  cancelAppointment,
  getArchivedAppointments,
  archiveAppointment,
  updatePastAppointments,
  initAppointmentStatusScheduler
};