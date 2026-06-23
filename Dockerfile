# ============================================================
#  Chaide Biblioteca Digital — imagen lista para producción
#  Funciona igual en servidor interno, Google Cloud, Railway, etc.
#  Construir:  docker build -t chaide-biblioteca .
#  Ejecutar:   docker run -d -p 8080:3000 -v chaide-data:/data \
#                -e NODE_ENV=production -e DATA_DIR=/data \
#                -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=... \
#                -e ADMIN_TOKEN=... -e COOKIE_SECURE=false \
#                chaide-biblioteca
# ============================================================

# ---- Etapa de compilación ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Quita las dependencias de desarrollo: la imagen final solo necesita runtime.
RUN npm prune --omit=dev

# ---- Etapa de ejecución ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# qpdf optimiza los PDFs al subirlos (Fast Web View). Es OPCIONAL: si se quita
# esta línea la app funciona igual, solo no linealiza los PDFs nuevos.
RUN apt-get update \
  && apt-get install -y --no-install-recommends qpdf \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

# Copiamos solo lo necesario para ejecutar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
COPY --from=build /app/package.json ./package.json

# Carpeta de datos persistente (PDFs, configuración, índices).
VOLUME ["/data"]

EXPOSE 3000

# Arranca el servidor (lee el puerto de la variable PORT).
CMD ["node", "dist/server.cjs"]
