# ─────────────────────────────────────────────────────────────────────────────
# ARCHIVED — This Dockerfile is no longer used for production deployment.
# The app is deployed on Vercel (see vercel.json).
# Kept for reference and local Docker-based development only.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Note: This assumes next.config.mjs has output: 'standalone'
COPY --from=builder /app/public ./public
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration files and unified startup script
COPY --from=builder --chown=nextjs:nodejs /app/run-migrations.js ./
COPY --from=builder --chown=nextjs:nodejs /app/start.js ./
COPY --from=builder --chown=nextjs:nodejs /app/supabase ./supabase

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "start.js"]
