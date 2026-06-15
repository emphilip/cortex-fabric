FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY services/mcp-server ./services/mcp-server
RUN pnpm install --filter @cortex/mcp-server... --frozen-lockfile || pnpm install --filter @cortex/mcp-server...
RUN pnpm --filter @cortex/shared build && pnpm --filter @cortex/mcp-server build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "services/mcp-server/dist/index.js"]
