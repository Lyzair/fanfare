# syntax=docker/dockerfile:1
# Fanfare as a self-hosted static site: build with Node, serve with Caddy. MIT licence.
# Build:  docker compose up -d --build     (see docs/self-hosting.md)
# The first build downloads about 660 MB of voices into a build cache; later builds reuse it.

# ---- stage 1: build the static site
FROM node:26.12.1-bookworm-slim AS build
WORKDIR /app
ENV npm_config_update_notifier=false npm_config_fund=false

# Dependencies first (patch-package runs in postinstall and fails the build if the patch does not apply).
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

COPY . .
COPY public/voices/LICENSES.md /opt/voices-LICENSES.md
# public/voices is a cache mount, so a rebuild does not download the voices again. The mount
# hides the tracked LICENSES.md, so it is put back inside the same step. Without BuildKit/buildah
# cache-mount support, delete the mount line: it only becomes slower.
RUN --mount=type=cache,target=/app/public/voices,id=fanfare-voices \
    cp /opt/voices-LICENSES.md /app/public/voices/LICENSES.md \
 && npm run build \
 && npm run check:dist

# ---- stage 2: serve it (no Node here)
FROM caddy:2.11.7-alpine
ARG SOURCE_URL=""
LABEL org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.title="Fanfare" \
      org.opencontainers.image.description="Fanfare: stadium-style announcements for youth football, served as a static site. Nothing leaves the browser; no access logs." \
      org.opencontainers.image.licenses="MIT"

# The official binary carries a file capability (bind to ports below 1024); it cannot start when all
# capabilities are dropped. We only use ports 8080/8443, so a plain copy (no capability) is enough.
RUN cp /usr/bin/caddy /tmp/caddy && rm /usr/bin/caddy && mv /tmp/caddy /usr/bin/caddy && chmod 755 /usr/bin/caddy \
 && adduser -D -u 10001 fanfare \
 && mkdir -p /data /config \
 && chown fanfare:fanfare /data /config
COPY docker/Caddyfile docker/Caddyfile.https docker/Caddyfile.acme docker/fanfare.caddy /etc/caddy/
COPY docker/entrypoint.sh /usr/local/bin/fanfare-entrypoint
COPY --from=build /app/dist /srv

ENV XDG_DATA_HOME=/data XDG_CONFIG_HOME=/config
USER fanfare
EXPOSE 8080 8443
HEALTHCHECK --interval=15s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/ || exit 1
ENTRYPOINT ["/usr/local/bin/fanfare-entrypoint"]
