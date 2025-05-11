# Usar una imagen base de Node.js
FROM node:18-alpine

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "src/server.js"]