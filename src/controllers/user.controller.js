/**
 * @file user.controller.js
 * @description Controlador para la gestión de usuarios (pacientes) en el sistema de citas médicas.
 * Este módulo proporciona funcionalidades para administrar perfiles de usuarios,
 * incluyendo operaciones CRUD estándar con las restricciones de seguridad correspondientes.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const User = require('../models/user.model');
const { sanitizeInput } = require('../middlewares/security.middleware');

/**
 * @function getUsers
 * @description Obtiene un listado de todos los usuarios del sistema,
 * con capacidad de filtrado por rol si el solicitante tiene permisos adecuados.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.query - Parámetros de consulta
 * @param {string} [req.query.role] - Filtro opcional por rol de usuario
 * @param {Object} req.user - Usuario autenticado (proveniente del middleware auth)
 * @param {string} req.user.role - Rol del usuario autenticado
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con el listado de usuarios
 */
const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const query = {};
    
    // Restricción de seguridad: solo médicos y administradores pueden filtrar por rol
    // Esto evita que pacientes puedan obtener listas selectivas de usuarios
    if (role && (req.user.role === 'doctor' || req.user.role === 'admin')) {
      query.role = role;
    }
    
    // Excluir el campo password por seguridad
    const users = await User.find(query, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
};

/**
 * @function getUserById
 * @description Obtiene la información detallada de un usuario específico por su ID.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del usuario a buscar
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con la información del usuario o mensaje de error
 */
const getUserById = async (req, res) => {
  try {
    // Buscar usuario excluyendo el campo password por seguridad
    const user = await User.findById(req.params.id, '-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuario', error: error.message });
  }
};

/**
 * @function updateUser
 * @description Actualiza la información de un usuario existente en el sistema.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del usuario a actualizar
 * @param {Object} req.body - Datos a actualizar
 * @param {string} [req.body.name] - Nombre actualizado del usuario
 * @param {string} [req.body.phoneNumber] - Número telefónico actualizado
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON con los datos actualizados o mensaje de error
 */
const updateUser = async (req, res) => {
  try {
    const { name, phoneNumber } = req.body;
    
    // Actualizar usuario con validación y devolver el documento actualizado
    // Solo se permiten actualizar campos específicos por seguridad
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { name, phoneNumber },
      { new: true, runValidators: true } // Asegura que se ejecuten validadores de esquema
    ).select('-password'); // Excluir el campo password por seguridad

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar usuario', error: error.message });
  }
};

/**
 * @function deleteUser
 * @description Elimina un usuario del sistema por su ID.
 * 
 * @param {Object} req - Objeto de solicitud Express
 * @param {Object} req.params - Parámetros de ruta
 * @param {string} req.params.id - ID del usuario a eliminar
 * @param {Object} res - Objeto de respuesta Express
 * 
 * @returns {Object} - Respuesta JSON confirmando la eliminación o mensaje de error
 */
const deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar usuario', error: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser
};