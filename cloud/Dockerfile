FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
ENV PORT=8790 DATA_DIR=/data
USER node
EXPOSE 8790
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O - http://127.0.0.1:8790/health || exit 1
CMD ["node", "server.js"]
