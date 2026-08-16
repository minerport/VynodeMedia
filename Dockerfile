FROM node:24-bookworm-slim AS dependencies
ENV NODE_OPTIONS=--use-system-ca
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8787 VYNODE_DATA_DIR=/config VYNODE_APP_ROOT=/app
WORKDIR /app
COPY --from=dependencies /app/package.json /app/package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
RUN npm prune --omit=dev --ignore-scripts && mkdir -p /config /media && chown -R node:node /app /config
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
EXPOSE 8787
VOLUME ["/config", "/media"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
