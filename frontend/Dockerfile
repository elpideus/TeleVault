# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Pass build arguments (optional, defaults are used if not provided)
ARG VITE_API_BASE_URL
ARG VITE_THEME=default
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_THEME=$VITE_THEME

RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine

# Limit worker_processes to 1
RUN sed -i 's/worker_processes.*/worker_processes 1;/g' /etc/nginx/nginx.conf

# Copy build output to Nginx's serve directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
