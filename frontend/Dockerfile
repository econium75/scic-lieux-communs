# SCIC Lieux Communs — Frontend Dockerfile v4 (simplifié, un seul stage)
FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copie tout le code (public/ inclus)
COPY . .

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD sh -c "npx next start -H 0.0.0.0 -p ${PORT:-3000}"
