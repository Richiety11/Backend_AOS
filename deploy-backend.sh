#!/bin/zsh

# Script para desplegar el backend en Docker y Kubernetes
# Autor: Equipo de Desarrollo
# Fecha: 11 Mayo 2025

# Colores para mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para mostrar mensajes
show_message() {
    echo -e "${2}${1}${NC}"
}

# Función para verificar si un comando finalizó correctamente
check_status() {
    if [ $? -eq 0 ]; then
        show_message "✅ $1" "${GREEN}"
    else
        show_message "❌ $1" "${RED}"
        exit 1
    fi
}

# Variables de configuración
DOCKER_USERNAME=""
IMAGE_NAME="backend"
IMAGE_TAG="latest"
KUBE_NAMESPACE="medical-system"

# Preguntar por el nombre de usuario de Docker
echo -n "Por favor, ingrese su nombre de usuario de Docker: "
read DOCKER_USERNAME
if [ -z "$DOCKER_USERNAME" ]; then
    show_message "Nombre de usuario no proporcionado, usando 'medicitas' como predeterminado" "${YELLOW}"
    DOCKER_USERNAME="medicitas"
fi

# Parte 1: Construir y publicar la imagen Docker
show_message "🚀 PASO 1: Construyendo la imagen Docker del backend..." "${YELLOW}"

# Navegar al directorio del backend
cd "$(dirname "$0")"

# Construir la imagen Docker
show_message "Construyendo imagen: ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}" "${YELLOW}"
docker build -t ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG} .
check_status "Construcción de imagen Docker"

# Preguntar si se desea publicar la imagen
echo -n "¿Desea publicar la imagen en Docker Hub? (s/n): "
read PUSH_IMAGE
if [[ $PUSH_IMAGE == "s" || $PUSH_IMAGE == "S" ]]; then
    show_message "Iniciando sesión en Docker Hub..." "${YELLOW}"
    docker login
    check_status "Inicio de sesión en Docker Hub"
    
    show_message "Publicando imagen: ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}" "${YELLOW}"
    docker push ${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}
    check_status "Publicación de imagen en Docker Hub"
else
    show_message "Omitiendo publicación de imagen" "${YELLOW}"
fi

# Parte 2: Desplegar en Kubernetes
echo -n "¿Desea desplegar la aplicación en Kubernetes? (s/n): "
read DEPLOY_KUBE
if [[ $DEPLOY_KUBE == "s" || $DEPLOY_KUBE == "S" ]]; then
    show_message "🚀 PASO 2: Desplegando en Kubernetes..." "${YELLOW}"
    
    # Verificar si kubectl está disponible
    if ! command -v kubectl &> /dev/null; then
        show_message "kubectl no está instalado. Por favor instálelo antes de continuar." "${RED}"
        exit 1
    fi
    
    # Verificar si el namespace existe, si no, crearlo
    if ! kubectl get namespace $KUBE_NAMESPACE &> /dev/null; then
        show_message "Creando namespace: $KUBE_NAMESPACE" "${YELLOW}"
        kubectl create namespace $KUBE_NAMESPACE
        check_status "Creación de namespace"
    fi
    
    # Actualizar el nombre de usuario en el archivo de deployment
    show_message "Actualizando archivo de deployment con el nombre de usuario: $DOCKER_USERNAME" "${YELLOW}"
    sed -i '' "s|\${YOUR_DOCKER_USERNAME}|$DOCKER_USERNAME|g" kubernetes/deployment.yaml
    check_status "Actualización del archivo de deployment"
    
    # Aplicar los archivos de Kubernetes
    show_message "Aplicando archivos de Kubernetes en namespace: $KUBE_NAMESPACE" "${YELLOW}"
    
    kubectl apply -f kubernetes/config.yaml
    check_status "Despliegue de config.yaml"
    
    kubectl apply -f kubernetes/secrets.yaml
    check_status "Despliegue de secrets.yaml"
    
    kubectl apply -f kubernetes/deployment.yaml
    check_status "Despliegue de deployment.yaml"
    
    kubectl apply -f kubernetes/service.yaml
    check_status "Despliegue de service.yaml"
    
    kubectl apply -f kubernetes/autoscaling.yaml
    check_status "Despliegue de autoscaling.yaml"
    
    # Esperar a que el deployment esté listo
    show_message "Esperando a que el deployment esté listo..." "${YELLOW}"
    kubectl rollout status deployment/medical-appointments-api -n $KUBE_NAMESPACE
    check_status "Rollout del deployment"
    
    # Mostrar información del servicio
    show_message "Obteniendo información del servicio..." "${YELLOW}"
    kubectl get service backend-service -n $KUBE_NAMESPACE
    
    show_message "✅ Despliegue en Kubernetes completado con éxito!" "${GREEN}"
else
    show_message "Omitiendo despliegue en Kubernetes" "${YELLOW}"
fi

show_message "✅ Proceso completado!" "${GREEN}"
show_message "Para verificar el estado de los pods: kubectl get pods -n $KUBE_NAMESPACE" "${GREEN}"
show_message "Para ver los logs: kubectl logs -f deployment/medical-appointments-api -n $KUBE_NAMESPACE" "${GREEN}"
