const app = require('./app');
const config = require('./config/config');

const server = app.listen(config.port, () => {
  console.log(`Servidor corriendo en puerto ${config.port}`);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});