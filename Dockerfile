# Image d'auto-hébergement d'Opportunity.
#
# Base glibc (node:22-slim) volontaire : les binaires précompilés de
# better-sqlite3 y fonctionnent sans recompilation. Build et run partagent la
# même base pour que le binaire natif reste compatible.

# --- Dépendances ---
FROM node:22-slim AS deps
WORKDIR /app
# Filet de sécurité si un binaire précompilé manque et qu'il faut recompiler.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Exécution ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# La base SQLite vit sur le volume persistant monté par Fly.
ENV OPPORTUNITY_DB_PATH=/data/opportunity.db

RUN useradd --uid 1001 --create-home app \
  && mkdir -p /data \
  && chown app:app /data

# Sortie autonome de Next : server.js + node_modules tracés (dont better-sqlite3).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Fixtures : permettent d'essayer en mode démo (MOCK_EXTERNAL=1) sans clé Google.
COPY --from=builder /app/fixtures ./fixtures

USER app
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
