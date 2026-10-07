# Build the preserved prototype and run both suites inside Docker.
FROM node:24-alpine AS build
WORKDIR /app
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
RUN node scripts/build-preview.cjs \
    && node tests/prototype.test.cjs \
    && node --test tests/server.test.cjs

# Optional design preview. It never shares live accounts or database contents.
FROM nginxinc/nginx-unprivileged:stable-alpine AS preview
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/index.html /usr/share/nginx/html/index.html
COPY --from=build /app/preview/ /usr/share/nginx/html/preview/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

# Live app: server-side sessions, private records and persistent SQLite storage.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=8080 MILO_DATA_DIR=/data
WORKDIR /app
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
COPY --from=build /app/src/server/ ./src/server/
COPY --from=build /app/src/live/ ./src/live/
COPY --from=build /app/scripts/bootstrap-admin.cjs /app/scripts/setup-admin.cjs /app/scripts/backup.cjs ./scripts/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server/main.cjs"]
