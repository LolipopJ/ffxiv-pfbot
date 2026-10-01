FROM oven/bun:1.4.2 AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
# Runtime uses the committed dictionary; skip Husky and the data submodule setup.
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/pfbot.sqlite \
    TZ=UTC

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun

CMD ["bun", "src/index.ts"]
