FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/slidev/package.json ./packages/slidev/package.json
RUN pnpm install --frozen-lockfile --filter @figuro/slidev
COPY packages/slidev ./packages/slidev
WORKDIR /workspace/packages/slidev
ARG SLIDEV_VERSION=53.0.0
ENV SLIDEV_VERSION=${SLIDEV_VERSION}
RUN if [ "$SLIDEV_VERSION" != "53.0.0" ]; then pnpm add --save-dev "@slidev/cli@$SLIDEV_VERSION" "@slidev/types@$SLIDEV_VERSION"; fi
RUN pnpm typecheck && pnpm test:package
ARG FIGURO_PACKAGE_VERSION
ENV FIGURO_PACKAGE_VERSION=${FIGURO_PACKAGE_VERSION}
RUN node tests/prepare-consumer.mjs
CMD ["pnpm", "test"]
