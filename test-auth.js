#!/usr/bin/env node

/**
 * Script para probar la autenticación y verificar si se ha solucionado el error 431
 * Este script envía múltiples solicitudes de inicio de sesión con diferentes tamaños de correo
 * para verificar el comportamiento de la aplicación.
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

// URL base para pruebas
const BASE_URL = 'http://localhost:3000/api';

// Credenciales de prueba
const generateEmail = (length) => {
  const prefix = 'test';
  const domain = '@example.com';
  // Generar una cadena de caracteres de longitud específica entre el prefijo y el dominio
  const paddingLength = length - prefix.length - domain.length;
  
  if (paddingLength <= 0) {
    return prefix + domain;
  }
  
  // Crear una cadena de caracteres aleatorios
  const padding = Array(paddingLength).fill().map(() => 
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
  
  return `${prefix}${padding}${domain}`;
};

// Función para probar el inicio de sesión
const testLogin = async (email, password) => {
  try {
    console.log(`\nProbando inicio de sesión con email de ${email.length} caracteres: ${email}`);
    
    const startTime = performance.now();
    
    // Intentar iniciar sesión
    const response = await axios.post(`${BASE_URL}/login`, {
      email,
      password
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Prueba exitosa (${duration.toFixed(2)}ms)`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
    
    return { success: true, duration, status: response.status };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.error(`❌ Error (${duration.toFixed(2)}ms):`);
    
    if (error.response) {
      // La solicitud fue realizada y el servidor respondió con un código de estado
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Response: ${JSON.stringify(error.response.data)}`);
      console.error(`  Headers: ${JSON.stringify(error.response.headers)}`);
      
      return { 
        success: false, 
        duration, 
        status: error.response.status, 
        message: error.response.data.message || error.message 
      };
    } else if (error.request) {
      // La solicitud fue hecha pero no se recibió respuesta
      console.error('  No se recibió respuesta');
      return { success: false, duration, status: null, message: 'No response received' };
    } else {
      // Error al configurar la solicitud
      console.error(`  Error: ${error.message}`);
      return { success: false, duration, status: null, message: error.message };
    }
  }
};

// Función para probar el registro
const testRegister = async (userData) => {
  try {
    console.log(`\nProbando registro con email de ${userData.email.length} caracteres: ${userData.email}`);
    
    const startTime = performance.now();
    
    // Intentar registrar
    const response = await axios.post(`${BASE_URL}/register`, userData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Prueba de registro exitosa (${duration.toFixed(2)}ms)`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
    
    return { success: true, duration, status: response.status, data: response.data };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.error(`❌ Error en registro (${duration.toFixed(2)}ms):`);
    
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Response: ${JSON.stringify(error.response.data)}`);
      
      return { 
        success: false, 
        duration, 
        status: error.response.status, 
        message: error.response.data.message || error.message 
      };
    } else {
      console.error(`  Error: ${error.message}`);
      return { success: false, duration, status: null, message: error.message };
    }
  }
};

// Función principal para ejecutar pruebas
const runTests = async () => {
  console.log('=== PRUEBAS DE INICIO DE SESIÓN Y REGISTRO ===');
  console.log('Ejecutando pruebas para verificar la solución del error 431...\n');
  
  const results = [];
  
  // 1. Probar inicio de sesión con email corto (debería funcionar)
  results.push(await testLogin('user@example.com', 'Password123!'));
  
  // 2. Probar inicio de sesión con email medio
  results.push(await testLogin(generateEmail(30), 'Password123!'));
  
  // 3. Probar inicio de sesión con email justo en el límite
  results.push(await testLogin(generateEmail(50), 'Password123!'));
  
  // 4. Probar inicio de sesión con email muy largo (debería fallar con validación en cliente)
  results.push(await testLogin(generateEmail(100), 'Password123!'));
  
  // 5. Probar registro con email normal
  const userData = {
    email: 'new_user@example.com',
    password: 'SecurePass123!',
    name: 'Usuario de Prueba',
    role: 'patient',
    phoneNumber: '1234567890'
  };
  results.push(await testRegister(userData));
  
  // 6. Probar registro con email muy largo
  const userDataLong = {
    ...userData,
    email: generateEmail(60),
    name: 'Usuario con Email Largo'
  };
  results.push(await testRegister(userDataLong));
  
  // Resumen de resultados
  console.log('\n=== RESUMEN DE RESULTADOS ===');
  results.forEach((result, index) => {
    console.log(`Prueba ${index + 1}: ${result.success ? 'ÉXITO' : 'ERROR'} - Status: ${result.status} - ${result.message || ''}`);
  });
  
  // Verificar si alguna prueba falló con código 431
  const error431Tests = results.filter(r => r.status === 431);
  
  if (error431Tests.length > 0) {
    console.log('\n❌ ALERTA: Se detectaron errores 431 en algunas pruebas.');
    console.log('   Revise los resultados para determinar si es comportamiento esperado.');
  } else {
    console.log('\n✅ No se detectaron errores 431 en las pruebas.');
    console.log('   Las optimizaciones parecen haber funcionado correctamente.');
  }
};

// Ejecutar pruebas
runTests().catch(console.error);
