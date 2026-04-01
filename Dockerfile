FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# STAGE 2 - Run the app cleanly
FROM node:20-alpine AS production
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app .
EXPOSE 8080
CMD ["node", "server.js"]