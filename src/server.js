/**
 * Punto de entrada principal de la aplicación
 * Inicializa el servidor HTTP y gestiona el ciclo de vida de la aplicación
 */

// Importar la aplicación Express configurada
const app = require('./app');
// Importar configuración del servidor
const config = require('./config/config');

/**
 * Iniciar el servidor HTTP en el puerto configurado
 * - Puerto definido en la configuración o variable de entorno
 * - Muestra mensaje de confirmación al iniciar correctamente
 */
const server = app.listen(config.port, () => {
  console.log(`Servidor corriendo en puerto ${config.port}`);
});

/**
 * Manejador para la señal SIGTERM (solicitud de terminación)
 * - Responde a comandos como 'docker stop' o despliegues en Kubernetes
 * - Realiza un cierre controlado para completar conexiones existentes
 * - Garantiza que no se pierdan datos en transacciones en curso
 */
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado exitosamente');
    process.exit(0); // Salir con código 0 (éxito)
  });
});

/**
 * Manejador para la señal SIGINT (interrupción - Ctrl+C)
 * - Responde cuando el desarrollador detiene el servidor con Ctrl+C
 * - Realiza un cierre controlado para completar conexiones existentes
 * - Permite el reinicio rápido durante desarrollo sin perder conexiones
 */
process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado exitosamente');
    process.exit(0); // Salir con código 0 (éxito)
  });
});