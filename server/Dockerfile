FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app/server

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY server/src ./src
COPY shared /app/shared
COPY catalog-data.js product-config.js option-quantities.js /app/

USER node
EXPOSE 3001
CMD ["node", "src/http.js"]
