/**
 * @file auth.routes.js
 * @description Define las rutas de API relacionadas con la autenticación y gestión de tokens.
 * Incluye endpoints para registro de usuarios, inicio de sesión, obtención de perfil 
 * y renovación de tokens de acceso. Incorpora documentación Swagger para cada endpoint.
 * @author Equipo de Desarrollo
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth.middleware');
const { register, login, getProfile, refreshAccessToken } = require('../controllers/auth.controller');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Registrar un nuevo usuario
 *     description: Registra un nuevo usuario (paciente o médico) en el sistema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - phoneNumber
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [patient, doctor]
 *               speciality:
 *                 type: string
 *               licenseNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 */
router.post('/register', register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Iniciar sesión
 *     description: Autentica a un usuario y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso
 */
router.post('/login', login);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags:
 *       - Autenticación
 *     summary: Obtener perfil
 *     description: Obtiene el perfil del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtenido exitosamente
 */
router.get('/profile', auth, getProfile);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Refrescar token de acceso
 *     description: Genera un nuevo token de acceso usando un token de refresco válido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nuevo token generado exitosamente
 */
router.post('/refresh-token', refreshAccessToken);

module.exports = router;