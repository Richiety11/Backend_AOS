#!/bin/zsh

# Este script le permitirá ejecutar rápidamente el backend en Docker sin necesidad
# de Kubernetes para pruebas locales

# Colores para mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para mostrar mensajes
show_message() {
    echo -e "${2}${1}${NC}"
}

# Variables de configuración
DOCKER_USERNAME="local"
IMAGE_NAME="backend"
IMAGE_TAG="latest"
CONTAINER_NAME="medicitas-backend"
PORT_MAPPING="3001:3000"
MONGODB_URI="mongodb://localhost:27017/medicitas"
JWT_SECRET="local-development-jwt-secret"
NODE_ENV="development"

# Construir la imagen Docker
show_message "🔨 Construyendo la imagen Docker del backend..." "${YELLOW}"
docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG} .

# Verificar si la construcción fue exitosa
if [ $? -eq 0 ]; then
    show_message "✅ Imagen construida exitosamente" "${GREEN}"
else
    show_message "❌ Error al construir la imagen" "${RED}"
    exit 1
fi

# Verificar si ya existe un contenedor con el mismo nombre y eliminarlo
if [ "$(docker ps -aq -f name=${CONTAINER_NAME})" ]; then
    show_message "🗑️ Eliminando contenedor existente: ${CONTAINER_NAME}" "${YELLOW}"
    docker stop ${CONTAINER_NAME}
    docker rm ${CONTAINER_NAME}
fi

# Preguntar si tiene MongoDB local
echo -n "¿Tiene una instancia local de MongoDB ejecutándose (s/n)? "
read HAS_LOCAL_MONGO
if [[ $HAS_LOCAL_MONGO == "n" || $HAS_LOCAL_MONGO == "N" ]]; then
    show_message "Iniciando contenedor MongoDB..." "${YELLOW}"
    # Verificar si el contenedor de MongoDB existe
    if [ "$(docker ps -aq -f name=mongodb)" ]; then
        docker start mongodb
    else
        docker run -d --name mongodb -p 27017:27017 mongo:latest
    fi
    
    # Ajustar la URI para MongoDB en Docker
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Para macOS, necesita usar host.docker.internal
        MONGODB_URI="mongodb://host.docker.internal:27017/medicitas"
    else
        # Para Linux, puede usar el nombre de la red por defecto
        MONGODB_URI="mongodb://172.17.0.1:27017/medicitas"
    fi
fi

# Ejecutar el contenedor
show_message "🚀 Iniciando contenedor backend en puerto ${PORT_MAPPING}" "${YELLOW}"
docker run --name ${CONTAINER_NAME} \
    -d -p ${PORT_MAPPING} \
    -e MONGODB_URI="${MONGODB_URI}" \
    -e JWT_SECRET="${JWT_SECRET}" \
    -e NODE_ENV="${NODE_ENV}" \
    -e PORT="3000" \
    ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}

# Verificar si el contenedor está corriendo
if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
    show_message "✅ Contenedor backend iniciado exitosamente" "${GREEN}"
    show_message "🌐 API disponible en: http://localhost:${PORT_MAPPING%%:*}/api" "${GREEN}"
else
    show_message "❌ Error al iniciar el contenedor" "${RED}"
    exit 1
fi

# Mostrar los logs
show_message "📋 Mostrando logs (Ctrl+C para salir):" "${YELLOW}"
docker logs -f ${CONTAINER_NAME}
