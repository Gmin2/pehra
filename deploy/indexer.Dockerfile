# the envio indexer. codegen at build, start at run, pointed at the compose postgres and hasura
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm codegen
CMD ["pnpm", "start"]
