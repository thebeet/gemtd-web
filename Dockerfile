# Prefer bookworm-slim over alpine: Docker DX / Scout flag many unfixed
# Alpine musl/busybox CVEs on node:*-alpine even when Node itself is current.
FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app

ENV CI=true

RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.24.0 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src ./src
COPY server ./server

RUN pnpm build

FROM node:22.23.2-bookworm-slim AS runtime
WORKDIR /app

ENV CI=true
ENV NODE_ENV=production
ENV PORT=1234
ENV SERVE_STATIC=1

RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.24.0 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/game ./src/game

EXPOSE 1234

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1234)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
