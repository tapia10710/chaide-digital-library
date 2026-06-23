# Auditoría — Chaide Digital Library

**Fecha:** 17 jun 2026 · **Alcance:** velocidad de carga del visor de PDF + problemas generales de la app.
**Estado:** la app compila y corre (Express + Vite en `:3000`), 21 documentos, 5 categorías. Los problemas de abajo son de rendimiento, corrección, seguridad y mantenibilidad — no impiden que arranque.

Cada hallazgo lleva severidad: 🔴 alta · 🟠 media · 🟡 baja, con archivo y línea.

---

## 1. Velocidad de carga de PDFs en el visor

### 🔴 1.1 Los PDFs se vuelven a descargar enteros en cada apertura (`no-store`)
`server.ts:350` — la ruta `/api/local-pdf` envía `Cache-Control: no-store`. El visor carga **siempre** por esta ruta (`getPdfProxyUrl` reescribe `/storage/*.pdf` → `/api/local-pdf`, `viewerUtils.ts:99`). Resultado: abrir el mismo catálogo dos veces vuelve a bajar el archivo completo desde cero. Irónicamente la ruta estática `/storage` sí cachea `immutable, max-age=1y` (`server.ts:704, 743`), pero el visor nunca la usa.
**Arreglo:** los PDFs son inmutables (nombre = id). Cambiar `no-store` por `public, max-age=31536000, immutable`. Ganancia inmediata en aperturas repetidas.

### 🔴 1.2 Al cargar el inicio se descargan y parsean TODOS los PDFs
`useStore.ts:188-191` → `backgroundIndexer.ts:48`. Apenas llegan los documentos, el cliente baja y extrae el texto de **los 21 PDFs** página por página, y puede lanzar OCR (`tesseract.js`, `pdfIndexerService.ts:341`, varios MB y muy pesado en CPU). En la primera visita esto satura red y CPU compitiendo justo con el catálogo que el usuario abrió. Se cachea en IndexedDB después, pero el costo del primer arranque es enorme.
**Arreglo:** no iniciar la indexación hasta que el usuario esté inactivo (`requestIdleCallback`), limitar a 1 PDF a la vez con pausas mayores, o moverla a un Web Worker / al servidor. Nunca correrla en la misma tarea que el render del visor.

### 🔴 1.3 `disableAutoFetch: false` baja el archivo entero antes de pintar
`ProfessionalFlipbook.tsx:768`. Con esto pdf.js descarga el PDF completo en vez de pedir solo los rangos de bytes de las primeras páginas visibles. El servidor **ya soporta range requests** (`server.ts:355-380`), así que poner `disableAutoFetch: true` (manteniendo `disableStream: false`) hace que la primera página aparezca mucho antes en catálogos grandes.

### 🟠 1.4 Dos precargadores solapados + bucle que se reinicia en cada flip
Conviven `startThumbnailPreloader` (renderiza miniaturas de **todas** las páginas, `:349`) y el pre-render de páginas de fondo (`:628`). Ambos renderizan toda la obra en segundo plano. Peor: el efecto de pre-render tiene `currentPage` en sus dependencias (`:672`), así que **el bucle completo se reinicia cada vez que pasas de página**, descartando el progreso. Mucho consumo de CPU mientras se lee.
**Arreglo:** un solo precargador, sacar `currentPage` del array de dependencias (usar un ref para la página actual) y limitar el rango precargado (p. ej. ±3 páginas).

### 🟠 1.5 Render a baja resolución y sin re-render al hacer zoom
`:145-147, :158` — `MAX_RENDER_SCALE = 1.0`, `BASE_QUALITY_MULTIPLIER = 1.0`, `imageSmoothingEnabled = false`. Las páginas se rasterizan a ≤ tamaño CSS sin escalar por DPR; en pantallas retina y al hacer zoom el texto se ve borroso/pixelado porque el canvas no se vuelve a renderizar a mayor escala (solo se estira el bitmap). Es un balance calidad/velocidad, pero hoy el zoom se ve mal.
**Arreglo:** renderizar la página visible a `min(fitScale * zoom * dpr, 2.0)` y activar suavizado para la página activa; mantener escala baja solo para las de fondo.

### 🟠 1.6 El proxy de PDFs externos carga todo en memoria, sin rango ni caché
`server.ts:1239-1256` — `/api/pdf-proxy` hace `axios` con `responseType:"arraybuffer"` y `res.send(Buffer…)`: sin streaming, sin soporte de rangos, sin cabeceras de caché. Los PDFs externos no cargan progresivamente y se re-piden en cada apertura. (Los locales usan la ruta buena.)

### 🟡 1.7 Sin compresión HTTP
No hay middleware `compression`. `/api/documents` incrusta portadas en base64 (la respuesta pesó ~57 KB con 21 docs) y se pide `no-cache` en cada navegación (`useStore.ts:174`). gzip/brotli reduciría JSON/JS/CSS notablemente (los PDF no comprimen, pero el resto sí).

### 🟡 1.8 cMaps desde CDN externo
`:770` carga los cMaps de pdf.js desde `cdn.jsdelivr.net`. Añade ida y vuelta externa para catálogos con fuentes especiales y rompe en redes sin salida/offline. Conviene empaquetarlos localmente.

### 🟡 1.9 Build sin división de chunks
`vite.config.ts` no define `build.rollupOptions.manualChunks`. pdfjs y firebase no se separan, así que el JS inicial es grande. (tesseract sí va por import dinámico — bien; firebase y pdfjs no.)

---

## 2. Bugs y corrección

### 🟠 2.1 GCS muerto pero sus dependencias siguen pesando
`server.ts` fuerza `let bucket: any = null; // Disable GCS upload`. Todas las ramas de subida/proxy a Google Cloud Storage son código muerto, y `firebase-admin` + `@google-cloud/storage` se importan sin usarse → arranque más lento y `node_modules` enorme.

### 🟠 2.2 `sqlite3` declarado pero nunca usado; la "DB" es un JSON reescrito entero
La persistencia es `data/db.json`, cargado en memoria y **reescrito completo en cada cambio** (`saveDb`). No es seguro ante escrituras concurrentes (riesgo de corromper el archivo) y no escala. `sqlite3` es una dependencia nativa pesada que no se usa.

### 🟡 2.3 Identificación de documentos por título
`ProfessionalFlipbook.tsx:326` busca el doc con `d.title === title`. Dos catálogos con el mismo título colisionan. Mejor pasar y comparar por `id`.

### 🟡 2.4 StrictMode duplica el trabajo en desarrollo
`main.tsx` envuelve en `StrictMode`: en dev, los efectos de carga del PDF, los precargadores y `startBackgroundIndexing` se ejecutan dos veces. No afecta producción, pero engaña al medir y dobla el costo en local.

---

## 3. Seguridad

### 🔴 3.1 `GEMINI_API_KEY` se hornea en el bundle del cliente
`vite.config.ts:10-11` hace `define: { 'process.env.GEMINI_API_KEY': … }`. Si pones una clave real en `.env`, queda incrustada en el JS público y visible para cualquiera. Una clave secreta nunca debe enviarse al cliente.

### 🔴 3.2 Endpoints de administración/escritura sin autenticación
`/api/documents/upload`, `/api/documents/:id/swap`, `/api/categories` POST/PUT/DELETE, etc. están abiertos con `Access-Control-Allow-Origin: *` (`server.ts:307-315`). Existe un `LoginPage` en el cliente, pero el servidor no valida nada: cualquiera que alcance el puerto puede subir o borrar catálogos.

### 🟠 3.3 `/api/pdf-proxy` es un proxy abierto (SSRF)
`server.ts:1233-1236` solo bloquea `localhost/127.0.0.1/0.0.0.0/::1`, pero **no** rangos privados (`10.x`, `192.168.x`, `169.254.169.254` — endpoint de metadatos en la nube, IPv6 ULA). En un host cloud podría alcanzar servicios internos. Hace falta lista blanca o bloqueo de rangos privados real.

---

## 4. Mantenibilidad / limpieza

- 🟡 **19 scripts `fix-css-*.ts`** + `fix-bucket.cjs`, `fix-bucket-2.cjs`, `patch-server.cjs` sueltos en la raíz: parches de un solo uso commiteados. Quitar.
- 🟡 **Artefactos y logs versionados:** `dist/`, `dev-server.err.log`, `dev-server.out.log`, `logs/`, `data/logs.txt`. Mover a `.gitignore`.
- 🟡 **`ProfessionalFlipbook.tsx` con ~2.800 líneas** mezcla render, gestos, búsqueda, OCR, índice y miniaturas. Conviene dividirlo en hooks/componentes.
- 🟡 **Límites inconsistentes:** subida 30 MB (`multer`) vs proxy 50 MB.

---

## Prioridad recomendada (máximo impacto / mínimo esfuerzo)

1. **1.1** quitar `no-store` del visor → caché de PDFs (1 línea).
2. **1.2** diferir/limitar la indexación masiva al estado inactivo.
3. **1.3** `disableAutoFetch: true` para primer pintado rápido (1 línea).
4. **3.1** sacar `GEMINI_API_KEY` del bundle.
5. **1.4** un solo precargador y sacar `currentPage` de dependencias.
6. **3.2 / 3.3** auth en escrituras + endurecer el proxy.
7. Limpieza: GCS muerto, `sqlite3`, scripts `fix-*`, logs/`dist` versionados.

Los puntos 1.1–1.4 por sí solos deberían transformar la sensación de velocidad del visor.
