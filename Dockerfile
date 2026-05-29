# Stage 1: Dependency Installation
FROM node:20-alpine AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy lockfiles and dependency manifest
COPY package.json package-lock.json ./
# Clean install dependencies
RUN npm ci

# Stage 2: Code Compilation
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# We disable it during build and runtime to enhance performance and privacy.
ENV NEXT_TELEMETRY_DISABLED 1

# Note: If database connection is needed at build time, supply it here.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL


RUN npm run build

# Stage 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root system user and group for container security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and public files
COPY --from=builder /app/public ./public

# Set up proper caching directory permissions
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage Next.js output standalone option to reduce image size (requires output: "standalone" in next.config.mjs)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# server.js is created automatically when "standalone" output is enabled
CMD ["node", "server.js"]
