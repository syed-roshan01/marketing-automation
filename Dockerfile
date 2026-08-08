FROM node:20-alpine AS builder
WORKDIR /app

# Install deps and build frontend
COPY package.json package-lock.json vite.config.mjs ./
COPY renderer ./renderer
RUN npm ci
RUN npm run build:react

FROM node:20-alpine
WORKDIR /app

# Install only production deps
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built frontend and server code
COPY --from=builder /app/public ./public
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
