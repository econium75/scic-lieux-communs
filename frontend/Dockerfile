# SCIC Lieux Communs — Frontend Dockerfile v4 (simplifié, un seul stage)
FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copie tout le code (public/ inclus)
COPY . .

# L'URL du backend doit être connue AU BUILD : Next.js fige les rewrites /api/* à ce moment-là.
# Railway la passe en build arg ; la valeur par défaut garantit un build correct sinon.
ARG NEXT_PUBLIC_API_URL=https://backend-production-0478.up.railway.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD sh -c "npx next start -H 0.0.0.0 -p ${PORT:-3000}"
