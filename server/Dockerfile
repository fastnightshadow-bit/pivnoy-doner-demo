FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src

USER node
EXPOSE 3001
CMD ["node", "src/http.js"]
