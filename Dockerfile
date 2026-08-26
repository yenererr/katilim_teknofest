# syntax=docker/dockerfile:1

# --- 1) Bağımlılıklar: build için tüm paketler -----------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2) Derleme: istemci (dist/client) + sunucu (dist/server.cjs) ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- 3) Üretim bağımlılıkları ---------------------------------------------
# Sunucu paketi --packages=external ile derlendiği için node_modules
# çalışma zamanında gereklidir; yalnızca prod bağımlılıkları kurulur.
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- 4) Çalışma imajı ------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Kök kullanıcı olarak çalışmamak için hazır gelen "node" kullanıcısı
RUN mkdir -p /app/.scraper-cache && chown -R node:node /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

# Dokploy healthcheck'i bu uca vurabilir; imaj içi kontrol de tanımlı.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
