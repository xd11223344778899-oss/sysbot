# Debian-based (glibc) image so the default Prisma engine works without
# musl-specific binary targets. Matches Railway's Nixpacks runtime.
FROM node:20-slim

WORKDIR /app

# OpenSSL is required by the Prisma query engine.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

# SQLite database lives in /data (mount a volume here to persist).
ENV DATABASE_URL=file:/data/sysbot.db
VOLUME ["/data"]

# Real restart support: process exits, the orchestrator restarts it.
CMD ["npm", "run", "start:prod"]
