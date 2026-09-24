# Alternative to Render: any Docker host. Mount a persistent volume on /data (database).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
