# Production: build once in the image; start serves static SPA in seconds (no `npm install` on every boot).
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Defaults match docker-compose: browser talks to Laravel on host port 8001 (`backend` publishes 8001:8000).
# Relative `/api` only works with Vite dev proxy or a reverse proxy — not with plain `serve`.
ARG VITE_API_BASE_URL=
ARG VITE_BACKEND_ORIGIN=http://localhost:8001
ARG VITE_STORAGE_MEDIA_ORIGIN=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BACKEND_ORIGIN=$VITE_BACKEND_ORIGIN
ENV VITE_STORAGE_MEDIA_ORIGIN=$VITE_STORAGE_MEDIA_ORIGIN

RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache wget

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf

EXPOSE 5173

# Static SPA plus /api /storage /sanctum reverse-proxy to Laravel (same public hostname).
CMD ["nginx", "-g", "daemon off;"]
