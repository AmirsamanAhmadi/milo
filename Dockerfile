# Build the preserved prototype and run both suites inside Docker.
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
COPY docs/code-scan-exceptions.json ./docs/code-scan-exceptions.json
RUN node scripts/build-preview.cjs \
    && node tests/prototype.test.cjs \
    && node --test tests/server.test.cjs tests/database.test.cjs \
    && python3 -m unittest discover -s tests -p 'test_*.py'

# SQLite runs exclusively in this service; no database port is published.
FROM node:24-alpine AS database
WORKDIR /app
ENV NODE_ENV=production MILO_DATA_DIR=/data
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /data /app-data /run/milo-db && chown node:node /data /app-data /run/milo-db && chmod 700 /data /app-data /run/milo-db
COPY --from=build /app/src/server/ ./src/server/
COPY --from=build /app/scripts/backup.cjs ./scripts/
USER node
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 CMD node -e "const db=require('./src/server/database-client.cjs').connectStore('/run/milo-db/database.sock');db.close()"
CMD ["node", "src/server/database-main.cjs"]

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
ENV NODE_ENV=production PORT=8080 MILO_DATA_DIR=/data MILO_PYTHON=/opt/jobspy/bin/python
WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN npm install --prefix /opt/codex --omit=dev @openai/codex@0.162.1 \
    && ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex
RUN apk upgrade --no-cache \
    && apk add --no-cache python3 py3-pip py3-virtualenv ca-certificates libstdc++ libreoffice-writer font-liberation font-dejavu \
    && python3 -m virtualenv /opt/jobspy \
    && /opt/jobspy/bin/pip install --no-cache-dir --only-binary=:all: -r requirements.txt \
    && rm -rf /usr/local/lib/node_modules /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /data && chown node:node /data && chmod 700 /data
COPY --from=build /app/src/server/ ./src/server/
COPY --from=build /app/src/live/ ./src/live/
COPY --from=build /app/scripts/bootstrap-admin.cjs /app/scripts/setup-admin.cjs /app/scripts/backup.cjs ./scripts/
COPY --from=build /app/scripts/backup.py ./scripts/
COPY tests/test_document_export.py ./tests/test_document_export.py
RUN PYTHONDONTWRITEBYTECODE=1 /opt/jobspy/bin/python -m unittest discover -s tests -p 'test_document_export.py' \
    && rm tests/test_document_export.py && rmdir tests
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const tls=Boolean(process.env.MILO_TLS_KEY);require(tls?'node:https':'node:http').get((tls?'https':'http')+'://localhost:8080/health',tls?{ca:require('node:fs').readFileSync(process.env.MILO_TLS_CERT)}:{},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "src/server/main.cjs"]
