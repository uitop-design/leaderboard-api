# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM build AS migrator
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3300
CMD ["node", "dist/main.js"]
