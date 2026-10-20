# RolêJunto — site (build do React) servido pelo Caddy
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
# Mapa: servidor de mapas opcional (padrão: OpenStreetMap)
ARG VITE_MAP_TILES=
ARG VITE_MAP_ATTRIBUTION=
ENV VITE_MAP_TILES=$VITE_MAP_TILES VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
