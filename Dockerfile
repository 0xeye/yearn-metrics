FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies — strip "scripts" workspace since we only need packages/*
COPY package.json bun.lock ./
RUN sed -i 's/"workspaces": \["packages\/\*", "scripts"\]/"workspaces": ["packages\/*"]/' package.json
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
RUN bun install

# Copy source
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/api packages/api

# Run migrations and start API
EXPOSE 3456
CMD ["sh", "-c", "bun run packages/db/src/migrate.ts && bun run packages/api/src/index.ts"]
