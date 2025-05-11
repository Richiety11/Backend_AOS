const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middlewares/auth.middleware');
const { getUsers, getUserById, updateUser, deleteUser } = require('../controllers/user.controller');

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
router.get('/', auth, checkRole(['admin']), getUsers);

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
router.get('/:id', auth, checkRole(['admin']), getUserById);

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