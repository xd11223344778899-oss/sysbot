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

# SQLite on Railway: mount a Volume at /data and set DATABASE_URL=file:/data/sysbot.db
# (Do not use Docker VOLUME — Railway uses its own Volume mounts.)
ENV DATABASE_URL=file:/data/sysbot.db

CMD ["npm", "run", "start:prod"]
