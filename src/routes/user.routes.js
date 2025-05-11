const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middlewares/auth.middleware');
const { getUsers, getUserById, updateUser, deleteUser } = require('../controllers/user.controller');
const User = require('../models/user.model');

/**
 * @swagger
 * /users:
 *   get:
 *     tags:
 *       - Usuarios
 *     summary: Obtener todos los usuarios
 *     description: Obtiene una lista de todos los usuarios registrados
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phoneNumber:
 *                     type: string
 *                   role:
 *                     type: string
 */
// Primero definimos las rutas específicas
/**
 * @swagger
 * /users/current:
 *   get:
 *     tags:
 *       - Usuarios
 *     summary: Obtener usuario actual
 *     description: Obtiene la información del usuario autenticado actual
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario actual obtenido exitosamente
 *       401:
 *         description: No autorizado
 */
router.get('/current', auth, async (req, res) => {
  try {
    // La propiedad id puede no estar disponible, usar _id que es más estándar en MongoDB
    const userId = req.user._id || req.user.id;
    
    if (!userId) {
      return res.status(400).json({ message: 'ID de usuario no disponible en la solicitud' });
    }
    
    console.log(`Buscando usuario con ID: ${userId}`);
    
    // Mejorar la búsqueda para manejar tanto usuarios normales como doctores
    let user = await User.findById(userId).select('-password');
    
    if (!user) {
      // Si no se encuentra como usuario normal, buscar como doctor
      const Doctor = require('../models/doctor.model');
      user = await Doctor.findById(userId).select('-password');
      
      if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
    }
    
    // Añadir logging para depuración
    console.log(`Usuario encontrado: ${user._id}, rol: ${user.role}`);
    
    // Devolver la respuesta en el formato que espera el frontend
    res.json({ 
      user,
      token: req.headers.authorization ? req.headers.authorization.split(' ')[1] : '',
      refreshToken: ''
    });
    
  } catch (error) {
    console.error('Error al obtener usuario actual:', error);
    res.status(500).json({ message: 'Error al obtener usuario actual', error: error.message });
  }
});

// Luego definimos la ruta para obtener todos los usuarios
router.get('/', auth, getUsers);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags:
 *       - Usuarios
 *     summary: Obtener usuario por ID
 *     description: Obtiene los detalles de un usuario específico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario encontrado exitosamente
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/:id', auth, getUserById);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags:
 *       - Usuarios
 *     summary: Actualizar usuario
 *     description: Actualiza la información de un usuario específico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usuario actualizado exitosamente
 *       404:
 *         description: Usuario no encontrado
 */
router.put('/:id', auth, updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     tags:
 *       - Usuarios
 *     summary: Eliminar usuario
 *     description: Elimina un usuario específico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario eliminado exitosamente
 *       404:
 *         description: Usuario no encontrado
 */
router.delete('/:id', auth, checkRole(['admin']), deleteUser);

module.exports = router;