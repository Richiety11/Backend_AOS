/**
 * @file doctor.routes.js
 * @description Define las rutas de API relacionadas con la gestión de médicos.
 * Incluye endpoints para listar médicos, filtrar por especialidad, obtener detalles de un médico,
 * actualizar información, gestionar disponibilidad y eliminar perfiles de médicos.
 * Implementa controles de acceso basados en roles y proporciona documentación Swagger.
 * @autor Equipo de Desarrollo
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middlewares/auth.middleware');
const {
  getDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  updateAvailability
} = require('../controllers/doctor.controller');

/**
 * @swagger
 * /doctors:
 *   get:
 *     tags:
 *       - Médicos
 *     summary: Obtener todos los médicos
 *     description: Obtiene una lista de todos los médicos registrados
 *     parameters:
 *       - in: query
 *         name: speciality
 *         schema:
 *           type: string
 *         description: Filtrar por especialidad médica
 *     responses:
 *       200:
 *         description: Lista de médicos obtenida exitosamente
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
 *                   speciality:
 *                     type: string
 *                   phoneNumber:
 *                     type: string
 *                   licenseNumber:
 *                     type: string
 *                   availability:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         day:
 *                           type: string
 *                         startTime:
 *                           type: string
 *                         endTime:
 *                           type: string
 */
router.get('/', getDoctors);

/**
 * @swagger
 * /doctors/{id}:
 *   get:
 *     tags:
 *       - Médicos
 *     summary: Obtener médico por ID
 *     description: Obtiene los detalles de un médico específico
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
 *         description: Médico encontrado exitosamente
 *       404:
 *         description: Médico no encontrado
 */
router.get('/:id', auth, getDoctorById);

/**
 * @swagger
 * /doctors/{id}:
 *   put:
 *     tags:
 *       - Médicos
 *     summary: Actualizar médico
 *     description: Actualiza la información de un médico específico
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
 *               speciality:
 *                 type: string
 *               availability:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     day:
 *                       type: string
 *                       enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *                     startTime:
 *                       type: string
 *                     endTime:
 *                       type: string
 *     responses:
 *       200:
 *         description: Médico actualizado exitosamente
 *       404:
 *         description: Médico no encontrado
 */
router.put('/:id', auth, checkRole(['doctor']), updateDoctor);

/**
 * @swagger
 * /doctors/{id}:
 *   delete:
 *     tags:
 *       - Médicos
 *     summary: Eliminar médico
 *     description: Elimina un médico específico
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
 *         description: Médico eliminado exitosamente
 *       404:
 *         description: Médico no encontrado
 */
router.delete('/:id', auth, checkRole(['admin']), deleteDoctor);

/**
 * @swagger
 * /doctors/{id}/availability:
 *   put:
 *     tags:
 *       - Médicos
 *     summary: Actualizar disponibilidad
 *     description: Actualiza la disponibilidad horaria de un médico
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
 *               availability:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     day:
 *                       type: string
 *                       enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *                     startTime:
 *                       type: string
 *                     endTime:
 *                       type: string
 *     responses:
 *       200:
 *         description: Disponibilidad actualizada exitosamente
 *       404:
 *         description: Médico no encontrado
 */
router.put('/:id/availability', auth, checkRole(['doctor']), updateAvailability);

module.exports = router;