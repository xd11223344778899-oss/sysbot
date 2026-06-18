FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

# DATABASE_URL must come from Railway Postgres (or docker-compose), not baked into the image.
CMD ["npm", "run", "start:prod"]
