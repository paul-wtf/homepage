# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- Stage 2: serve ----------
FROM nginxinc/nginx-unprivileged:alpine-slim

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security.inc /etc/nginx/conf.d/security.inc
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
