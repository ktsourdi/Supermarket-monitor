# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx playwright install --with-deps chromium && npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]