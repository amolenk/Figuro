FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/slidev/package.json ./packages/slidev/package.json
RUN pnpm install --frozen-lockfile --filter @figuro/slidev
COPY packages/slidev ./packages/slidev
WORKDIR /workspace/packages/slidev
RUN node tests/prepare-consumer.mjs
CMD ["pnpm", "test"]
