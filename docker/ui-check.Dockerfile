FROM node:24-alpine
RUN apk add --no-cache chromium \
    && npm install --prefix /opt/browser --omit=dev playwright-core@1.58.2
ENV NODE_PATH=/opt/browser/node_modules
WORKDIR /workspace
COPY scripts/check-live-ui.cjs ./scripts/check-live-ui.cjs
CMD ["node", "scripts/check-live-ui.cjs"]
