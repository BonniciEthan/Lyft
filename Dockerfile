# syntax=docker/dockerfile:1

# ---------- Stage 1: build the React client ----------
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- Stage 2: install server production deps (native better-sqlite3) ----------
FROM node:20-bookworm-slim AS server-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- Stage 3: lean runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3456 \
    DATA_DIR=/app/data \
    CLIENT_DIST=/app/client/dist
WORKDIR /app

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json server/index.js ./server/
COPY --from=client-build /app/client/dist ./client/dist

RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3456/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
