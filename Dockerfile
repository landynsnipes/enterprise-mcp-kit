# syntax=docker/dockerfile:1.7
FROM docker.io/library/node@sha256:e71b848e62e2c32bf5572b327b032a0da79b6a390bc924cdb827249c81e13a88 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM docker.io/library/node@sha256:e71b848e62e2c32bf5572b327b032a0da79b6a390bc924cdb827249c81e13a88 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/src/governance-http-server.js"]
