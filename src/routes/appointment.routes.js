/**
 * @file appointment.routes.js
 * @description Define las rutas de API relacionadas con la gestión de citas médicas.
 * Incluye endpoints para crear, listar, filtrar, actualizar, cancelar y archivar citas.
 * Implementa controles de acceso y validaciones para asegurar la integridad de los datos
 * y el cumplimiento de las reglas de negocio relacionadas con la programación de citas.
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middlewares/auth.middleware');
const {
  createAppointment,
  updateAppointment,
  getAppointments,
  getAppointmentById,
  cancelAppointment,
  getArchivedAppointments,
  archiveAppointment
} = require('../controllers/appointment.controller');

/**
 * @swagger
 * /appointments:
 *   post:
 *     tags:
 *       - Citas
 *     summary: Crear nueva cita
 *     description: Crea una nueva cita médica
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *               - date
 *               - time
 *               - reason
 *             properties:
 *               doctorId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cita creada exitosamente
 */
router.post('/', auth, createAppointment);

/**
 * @swagger
 * /appointments:
 *   get:
 *     tags:
 *       - Citas
 *     summary: Obtener citas
 *     description: Obtiene todas las citas del usuario o médico autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtrar por estado de la cita
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial para filtrar
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final para filtrar
 *     responses:
 *       200:
 *         description: Lista de citas obtenida exitosamente
 */
router.get('/', auth, getAppointments);

/**
 * IMPORTANTE: Las rutas específicas como '/archived' deben venir ANTES de rutas parametrizadas como '/:id'
 * para evitar que Express interprete 'archived' como un ID. Este es un patrón estándar en Express.
 * 
 * @swagger
 * /appointments/archived:
 *   get:
 *     tags:
 *       - Citas
 *     summary: Obtener citas archivadas
 *     description: Obtiene todas las citas archivadas del usuario o médico autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         description: ID del paciente para filtrar (solo doctores)
 *     responses:
 *       200:
 *         description: Lista de citas archivadas obtenida exitosamente
 */
router.get('/archived', auth, getArchivedAppointments);

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     tags:
 *       - Citas
 *     summary: Obtener cita por ID
 *     description: Obtiene los detalles de una cita específica
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
 *         description: Detalles de la cita obtenidos exitosamente
 */
router.get('/:id', auth, getAppointmentById);

/**
 * @swagger
 * /appointments/{id}:
 *   put:
 *     tags:
 *       - Citas
 *     summary: Actualizar cita
 *     description: Actualiza el estado o notas de una cita
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
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, cancelled, completed]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cita actualizada exitosamente
 */
router.put('/:id', auth, updateAppointment);

/**
 * @swagger
 * /appointments/{id}/cancel:
 *   put:
 *     tags:
 *       - Citas
 *     summary: Cancelar cita
 *     description: Cancela una cita existente
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
 *         description: Cita cancelada exitosamente
 */
router.put('/:id/cancel', auth, cancelAppointment);

/**
 * @swagger
 * /appointments/{id}/archive:
 *   put:
 *     tags:
 *       - Citas
 *     summary: Archivar cita
 *     description: Archiva una cita completada o cancelada
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
 *         description: Cita archivada exitosamente
 */
router.put('/:id/archive', auth, archiveAppointment);

module.exports = router;