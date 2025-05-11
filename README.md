# API de Gestión de Citas Médicas

API REST para la gestión de citas médicas con autenticación JWT, documentación Swagger y despliegue en Docker y Kubernetes.

## Características

- Autenticación de usuarios y médicos mediante JWT
- Gestión completa de citas médicas
- Documentación con Swagger
- Despliegue containerizado con Docker
- Orquestación con Kubernetes
- Autoescalamiento basado en uso de recursos
- Implementación de medidas de seguridad

## Requisitos Previos

- Node.js 18 o superior
- MongoDB
- Docker
- Kubernetes (minikube o cluster)
- kubectl CLI

## Configuración Local

1. Clonar el repositorio:
   ```bash
   git clone <url-repositorio>
   cd <directorio-proyecto>
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Crear archivo .env con las variables de entorno necesarias:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/medical_appointments
   JWT_SECRET=your_jwt_secret_key_here
   NODE_ENV=development
   RATE_LIMIT_WINDOW=15
   RATE_LIMIT_MAX=100
   ```

4. Iniciar la aplicación en modo desarrollo:
   ```bash
   npm run dev
   ```

## Despliegue con Docker

1. Construir la imagen:
   ```bash
   docker build -t medical-appointments-api .
   ```

2. Ejecutar el contenedor:
   ```bash
   docker run -p 3000:3000 --env-file .env medical-appointments-api
   ```

## Despliegue en Kubernetes

1. Crear los secretos necesarios:
   ```bash
   kubectl create secret generic mongodb-secret --from-literal=uri=mongodb://mongodb-service:27017/medical_appointments
   kubectl create secret generic jwt-secret --from-literal=secret=your_jwt_secret_key_here
   ```

2. Aplicar las configuraciones de Kubernetes:
   ```bash
   kubectl apply -f kubernetes/deployment.yaml
   kubectl apply -f kubernetes/autoscaling.yaml
   ```

3. Verificar el despliegue:
   ```bash
   kubectl get pods
   kubectl get services
   kubectl get hpa
   ```

## Seguridad Implementada

1. **Autenticación y Autorización**:
   - Tokens JWT para autenticación
   - Validación de roles y permisos
   - Expiración de tokens configurable

2. **Protección contra ataques**:
   - Rate limiting para prevenir DDoS
   - Sanitización de entradas para prevenir XSS
   - Headers de seguridad con Helmet
   - Validación de IDs de MongoDB
   - CORS configurado

3. **Seguridad en la API**:
   - Validación de datos de entrada
   - Mensajes de error seguros
   - Logging de actividades
   - Manejo seguro de contraseñas con bcrypt

4. **Seguridad en Kubernetes**:
   - Secretos para datos sensibles
   - Límites de recursos configurados
   - Health checks implementados
   - Autoescalamiento basado en métricas

## Documentación API

La documentación de la API está disponible en:
```
http://localhost:3000/api/docs
```

## Monitoreo

- Los logs de la aplicación se encuentran en la carpeta `logs/`
- Métricas de Kubernetes disponibles a través de:
  ```bash
  kubectl top pods
  kubectl top nodes
  ```
- Estado del autoescalamiento:
  ```bash
  kubectl get hpa medical-appointments-api-hpa
  ```

## Pruebas

Para ejecutar las pruebas:
```bash
npm test
```

## Variables de Entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| PORT | Puerto del servidor | 3000 |
| MONGODB_URI | URI de conexión a MongoDB | mongodb://localhost:27017/medical_appointments |
| JWT_SECRET | Clave secreta para JWT | - |
| NODE_ENV | Entorno de ejecución | development |
| RATE_LIMIT_WINDOW | Ventana de tiempo para rate limiting (minutos) | 15 |
| RATE_LIMIT_MAX | Máximo de peticiones por ventana | 100 |