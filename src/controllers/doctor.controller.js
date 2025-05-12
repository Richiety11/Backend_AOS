/**
 * @file doctor.controller.js
 * @description Controlador para la gestión de médicos en el sistema de citas médicas.
 * Este módulo proporciona funcionalidades para administrar perfiles de médicos,
 * incluyendo operaciones CRUD y la gestión de su disponibilidad horaria.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const Doctor = require('../models/doctor.model');
const { sanitizeInput } = require('../middlewares/security.middleware');
const { logger } = require('../utils/logger');

/**
 * @function getDoctors
 * @description Obtiene un listado de todos los médicos disponibles en el sistema,
 * con capacidad de filtrado por especialidad.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.query - Parámetros de consulta
 * @param {string} [req.query.speciality] - Filtro opcional por especialidad médica
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con el listado de médicos
 */
const getDoctors = async (req, res) => {
  try {
    const { speciality } = req.query;
    let query = {};
    
    // Si se proporciona especialidad, crear un filtro de búsqueda insensible a mayúsculas/minúsculas
    if (speciality) {
      query.speciality = new RegExp(speciality, 'i');
    }
    
    // Excluir el campo password por seguridad
    const doctors = await Doctor.find(query, '-password');
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener médicos', error: error.message });
  }
};

/**
 * @function getDoctorById
 * @description Obtiene la información detallada de un médico específico por su ID.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del médico a buscar
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con la información del médico o mensaje de error
 */
const getDoctorById = async (req, res) => {
  try {
    // Buscar al médico excluyendo el campo password
    const doctor = await Doctor.findById(req.params.id, '-password');
    if (!doctor) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener médico', error: error.message });
  }
};

/**
 * @function updateDoctor
 * @description Actualiza la información de un médico existente en el sistema.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del médico a actualizar
 * @param {Object} req.body - Datos a actualizar
 * @param {string} [req.body.name] - Nombre actualizado del médico
 * @param {string} [req.body.phoneNumber] - Número telefónico actualizado
 * @param {string} [req.body.speciality] - Especialidad médica actualizada
 * @param {Array} [req.body.availability] - Disponibilidad horaria actualizada
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con los datos actualizados o mensaje de error
 */
const updateDoctor = async (req, res) => {
  try {
    const { name, phoneNumber, speciality, availability } = req.body;
    // Actualizar con validación y devolver el documento actualizado
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { name, phoneNumber, speciality, availability },
      { new: true, runValidators: true } // Asegura que se ejecuten validadores de esquema y devuelve el documento actualizado
    ).select('-password');

    if (!updatedDoctor) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }

    res.json(updatedDoctor);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar médico', error: error.message });
  }
};

/**
 * @function deleteDoctor
 * @description Elimina un médico del sistema por su ID.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del médico a eliminar
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON confirmando la eliminación o mensaje de error
 */
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

/**
 * @function updateAvailability
 * @description Actualiza la disponibilidad horaria de un médico, verificando permisos
 * y validando el formato de los datos proporcionados.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del médico cuya disponibilidad se actualizará
 * @param {Object} req.body - Datos de la solicitud
 * @param {Array} req.body.availability - Lista de slots de disponibilidad
 * @param {Object} req.user - Usuario autenticado (proveniente del middleware auth)
 * @param {string} req.user._id - ID del usuario autenticado
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con los datos actualizados o mensaje de error
 */
const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const doctorId = req.params.id;

    // Validación de seguridad: verificar que el doctor que hace la petición 
    // es el mismo cuya disponibilidad se va a actualizar
    if (req.user._id.toString() !== doctorId) {
      logger.warn('Intento de actualizar disponibilidad de otro doctor', {
        requestingUserId: req.user._id,
        targetDoctorId: doctorId
      });
      return res.status(403).json({ 
        message: 'No tiene permiso para actualizar la disponibilidad de otro doctor' 
      });
    }

    // Validar que la disponibilidad es un array
    if (!Array.isArray(availability)) {
      logger.error('Formato de disponibilidad inválido', { availability });
      return res.status(400).json({ 
        message: 'El formato de la disponibilidad es inválido' 
      });
    }

    // Validar la estructura de cada slot de disponibilidad
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

    // Actualizar disponibilidad en la base de datos
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      doctorId,
      { availability },
      { new: true, runValidators: true } // Asegura validación y devuelve documento actualizado
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