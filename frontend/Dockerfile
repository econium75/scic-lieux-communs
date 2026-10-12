# SCIC Lieux Communs — Frontend Dockerfile v3 (force rebuild sans cache public/)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Vérifier que public/ contient bien les fichiers PWA
RUN ls -la public/ && test -f public/sw.js && test -f public/manifest.json
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# IMPORTANT : public/ copié EN PREMIER pour qu'il soit toujours servi
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Vérification runtime
RUN ls -la public/ && echo "public/ OK with $(ls public | wc -l) files"

USER nextjs
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"

CMD sh -c "npx next start -H 0.0.0.0 -p ${PORT:-3000}"
