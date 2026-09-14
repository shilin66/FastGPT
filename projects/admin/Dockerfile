FROM node:24-alpine AS deps
WORKDIR /app

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat && npm install -g pnpm@10.33.2

COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY packages ./packages
COPY sdk ./sdk
COPY projects/admin/package.json ./projects/admin/package.json

RUN if [ -z "$proxy" ]; then pnpm install --frozen-lockfile; else pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com; fi

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/sdk ./sdk
COPY --from=deps /app/projects/admin/node_modules ./projects/admin/node_modules
COPY projects/admin ./projects/admin

RUN apk add --no-cache libc6-compat && npm install -g pnpm@10.33.2
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm --filter @fastgpt-sdk/logger --filter @fastgpt-sdk/otel --filter @fastgpt-sdk/storage build
RUN pnpm --filter @fastgpt/admin build

FROM node:24-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN apk add --no-cache curl ca-certificates && update-ca-certificates

COPY --from=builder /app/projects/admin/next.config.js /app/projects/admin/next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/projects/admin/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/projects/admin/.next/static /app/projects/admin/.next/static
COPY --from=builder /app/projects/admin/package.json ./package.json

RUN chown -R nextjs:nodejs /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
EXPOSE 3001
USER nextjs

ENTRYPOINT ["node", "./projects/admin/server.js"]
