# the api with the shared perpl package from the workspace. built from the repo root
FROM node:24-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/perpl ./packages/perpl
COPY services/api ./services/api
RUN pnpm install --filter @pehra/api... --prod=false --config.confirmModulesPurge=false
WORKDIR /app/services/api
CMD ["node", "--import", "tsx", "src/index.ts"]
