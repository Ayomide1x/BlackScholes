# Build the static site, then serve it with a small Caddy. The VM's shared
# Caddy terminates HTTPS and proxies to this container on 127.0.0.1:3410.

FROM node:22-alpine AS build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm test && npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile.container /etc/caddy/Caddyfile
COPY --from=build /web/dist /srv
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
