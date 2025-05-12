/**
 * Controlador de citas médicas
 * 
 * Gestiona todas las operaciones relacionadas con citas:
 * - Creación, actualización y cancelación de citas
 * - Consulta de citas para médicos y pacientes
 * - Archivado de citas completadas o canceladas
 * - Actualización automática de estados
 */

// Modelos de datos
const Appointment = require('../models/appointment.model'); // Modelo de citas
const Doctor = require('../models/doctor.model'); // Modelo de médicos

// Biblioteca para manipulación de fechas y horas
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc'); // Plugin para manejo de UTC
const timezone = require('dayjs/plugin/timezone'); // Plugin para manejo de zonas horarias

// Utilidad de logging
const { logger } = require('../config/config');

// Configurar plugins de dayjs
dayjs.extend(utc); // Habilitar manejo de fechas UTC
dayjs.extend(timezone); // Habilitar manejo de zonas horarias

/**
 * Crea una nueva cita médica
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.body - Datos de la cita a crear
 * @param {string} req.body.doctorId - ID del médico para la cita
 * @param {string} req.body.date - Fecha de la cita (YYYY-MM-DD)
 * @param {string} req.body.time - Hora de la cita (HH:MM)
 * @param {string} req.body.reason - Motivo de la consulta
 * @param {string} [req.body.patientId] - ID del paciente (requerido si es un médico creando la cita)
 * @param {Object} req.user - Usuario autenticado (paciente o médico)
 * @param {Object} res - Objeto de respuesta Express
 * @returns {Object} Respuesta JSON con la cita creada o mensaje de error
 */
const createAppointment = async (req, res) => {
  try {
    // Extraer datos de la solicitud
    const { doctorId, date, time, reason, patientId } = req.body;
    
    // Registrar intento de creación para auditoría y debugging
    logger.info('Intento de creación de cita', {
      userId: req.user._id,
      doctorId,
      date,
      time,
      patientId
    });
    
    /**
     * Validación de campos obligatorios
     * - Todas las citas requieren doctor, fecha, hora y motivo
     */
    if (!doctorId || !date || !time || !reason) {
      // Registrar datos faltantes para diagnosticar problemas de UI o API
      logger.warn('Datos incompletos en creación de cita', {
        userId: req.user._id,
        missing: {
          doctorId: !doctorId,
          date: !date,
          time: !time,
          reason: !reason
        }
      });
      
      // Respuesta detallada que indica exactamente qué campo falta
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
    
    /**
     * Validación de regla de negocio: un médico solo puede agendar citas para sí mismo
     * - Previene que un médico cree citas para otros médicos
     * - Medida de seguridad para mantener control sobre la agenda médica
     */
    if (req.user.constructor.modelName === 'Doctor' && req.user._id.toString() !== doctorId) {
      // Registrar intento no autorizado
      logger.warn('Médico intentando agendar cita para otro médico', {
        doctorId: req.user._id, // ID del médico que hace la solicitud
        targetDoctorId: doctorId // ID del médico para el que intenta crear la cita
      });
      
      // Respuesta de error de autorización
      return res.status(403).json({ 
        message: 'Los médicos solo pueden agendar citas para sí mismos',
      });
    }
    
    /**
     * Determina el ID del paciente según el rol del usuario autenticado
     * - Si es paciente: el paciente es el usuario mismo
     * - Si es médico: debe especificar explícitamente el ID del paciente
     */
    let actualPatientId = req.user._id; // Por defecto, el usuario actual (para pacientes)
    
    if (req.user.constructor.modelName === 'Doctor') {
      // Médicos deben especificar para qué paciente están creando la cita
      if (!patientId) {
        logger.warn('Doctor intentando crear cita sin especificar paciente', {
          doctorId: req.user._id
        });
        
        return res.status(400).json({
          message: 'Debe seleccionar un paciente para la cita'
        });
      }
      actualPatientId = patientId; // Usar el paciente especificado por el médico
    }

    /**
     * Validación del formato de fecha
     * - Asegura que la fecha tenga un formato válido
     * - Previene errores en el procesamiento posterior
     */
    const dateObj = dayjs(date);
    if (!dateObj.isValid()) {
      logger.warn('Formato de fecha inválido', { date, userId: req.user._id });
      return res.status(400).json({ message: 'Formato de fecha inválido' });
    }

    /**
     * Validación del formato de hora (HH:MM)
     * - Utiliza expresión regular para verificar el formato correcto
     * - Asegura que las horas estén entre 00-23 y minutos entre 00-59
     */
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      logger.warn('Formato de hora inválido', { time, userId: req.user._id });
      return res.status(400).json({ message: 'Formato de hora inválido. Use HH:mm' });
    }

    /**
     * Verificación de disponibilidad del médico
     * - Comprueba que el médico no tenga otra cita a la misma hora
     * - Verifica que la hora esté dentro del horario de atención del médico
     * - Utiliza el método estático del modelo Appointment para centralizar esta lógica
     */
    try {
      await Appointment.checkAvailability(doctorId, date, time);
    } catch (availabilityError) {
      // Registrar el error específico de disponibilidad
      logger.warn('Error de disponibilidad', {
        error: availabilityError.message,
        userId: req.user._id,
        doctorId,
        date,
        time
      });
      
      // Devolver mensaje detallado sobre el problema de disponibilidad
      return res.status(400).json({ 
        message: 'Error de disponibilidad',
        details: availabilityError.message
      });
    }

    /**
     * Creación del objeto de cita
     * - Utiliza los datos validados para crear la instancia
     * - Elimina espacios extras en el motivo con trim()
     */
    const appointment = new Appointment({
      patient: actualPatientId, // ID del paciente (el usuario o especificado por médico)
      doctor: doctorId, // ID del médico seleccionado
      date, // Fecha validada
      time, // Hora validada
      reason: reason.trim() // Motivo de la consulta (eliminando espacios innecesarios)
    });

    // Guardar la cita en la base de datos
    await appointment.save();
    
    // Registrar éxito para auditoría
    logger.info('Cita creada exitosamente', {
      appointmentId: appointment._id, // ID de la nueva cita
      userId: req.user._id, // Usuario que la creó
      doctorId // Médico asignado
    });

    /**
     * Respuesta exitosa
     * - Código 201 (Created) para indicar recurso creado
     * - Incluye mensaje descriptivo
     * - Devuelve la cita con referencias populadas para uso inmediato en frontend
     */
    res.status(201).json({
      message: 'Cita agendada exitosamente',
      appointment: await appointment.populate([
        'patient', // Incluir datos completos del paciente
        {
          path: 'doctor',
          select: 'name email speciality licenseNumber' // Datos relevantes del médico
        }
      ])
    });
  } catch (error) {
    // Registrar error detallado para diagnóstico
    logger.error('Error al crear cita', {
      error: error.message,
      userId: req.user._id,
      stack: error.stack // Incluir stack trace para debugging
    });
    
    // Determinar código de estado según el tipo de error
    // ValidationError = 400, otros errores = 500
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ 
      message: 'Error al crear la cita', 
      details: error.message // Detalles específicos para debugging en frontend
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