const Doctor = require('../models/doctor.model');
const { sanitizeInput } = require('../middlewares/security.middleware');
const { logger } = require('../utils/logger');

// Obtener todos los médicos
const getDoctors = async (req, res) => {
  try {
    const { speciality } = req.query;
    let query = {};
    
    if (speciality) {
      query.speciality = new RegExp(speciality, 'i');
    }
    
    const doctors = await Doctor.find(query, '-password');
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener médicos', error: error.message });
  }
};

// Obtener un médico por ID
const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id, '-password');
    if (!doctor) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener médico', error: error.message });
  }
};

// Actualizar un médico
const updateDoctor = async (req, res) => {
  try {
    const { name, phoneNumber, speciality, availability } = req.body;
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { name, phoneNumber, speciality, availability },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedDoctor) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }

    res.json(updatedDoctor);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar médico', error: error.message });
  }
};

// Eliminar un médico
const deleteDoctor = async (req, res) => {
  try {
    const deletedDoctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!deletedDoctor) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }
    res.json({ message: 'Médico eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar médico', error: error.message });
  }
};

// Actualizar disponibilidad
const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const doctorId = req.params.id;

    // Validar que el doctor que hace la petición es el mismo que se quiere actualizar
    if (req.user._id.toString() !== doctorId) {
      logger.warn('Intento de actualizar disponibilidad de otro doctor', {
        requestingUserId: req.user._id,
        targetDoctorId: doctorId
      });
      return res.status(403).json({ 
        message: 'No tiene permiso para actualizar la disponibilidad de otro doctor' 
      });
    }

    // Validar el formato de la disponibilidad
    if (!Array.isArray(availability)) {
      logger.error('Formato de disponibilidad inválido', { availability });
      return res.status(400).json({ 
        message: 'El formato de la disponibilidad es inválido' 
      });
    }

    // Validar cada entrada de disponibilidad
    for (const slot of availability) {
      if (!slot.day || !slot.startTime || !slot.endTime) {
        logger.error('Datos de disponibilidad incompletos', { slot });
        return res.status(400).json({ 
          message: 'Cada slot de disponibilidad debe tener día, hora de inicio y hora de fin' 
        });
      }
    }

    logger.debug('Actualizando disponibilidad del doctor', {
      doctorId,
      availabilityCount: availability.length
    });

    const updatedDoctor = await Doctor.findByIdAndUpdate(
      doctorId,
      { availability },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedDoctor) {
      logger.error('Doctor no encontrado al actualizar disponibilidad', { doctorId });
      return res.status(404).json({ message: 'Médico no encontrado' });
    }

    logger.info('Disponibilidad actualizada exitosamente', {
      doctorId,
      availabilityCount: updatedDoctor.availability.length
    });

    res.json(updatedDoctor);
  } catch (error) {
    logger.error('Error al actualizar disponibilidad', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Error al actualizar disponibilidad', 
      error: error.message 
    });
  }
};

module.exports = {
  getDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  updateAvailability
};