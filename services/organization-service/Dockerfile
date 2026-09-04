FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 4002

CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]

