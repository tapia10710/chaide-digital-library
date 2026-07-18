# 06 — Despliegue y respaldo

> **Aviso de actualización manual:** comandos, rutas, responsables y fechas deben comprobarse antes de cada despliegue. Este documento no ejecuta ni programa respaldos. Última revisión manual: **17 de julio de 2026**.

## Requisitos

- Git.
- Node.js 22 o superior.
- npm y acceso al repositorio.
- Para contenedores: Docker Engine y Docker Compose.
- Para producción completa: almacenamiento persistente, variables secretas y HTTPS o red interna controlada.
- Opcional fuera de Docker: `qpdf` para Fast Web View.

## Variables

| Variable | Requerida | Descripción |
|---|:---:|---|
| `PORT` | No | Puerto del servidor; valor habitual `3000`. |
| `DATA_DIR` | Producción | Directorio persistente explícito. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Railway | Ruta del volumen suministrada automáticamente si `DATA_DIR` no está definida. |
| `ADMIN_USERNAME` | Administración | Usuario de la cuenta administrativa. |
| `ADMIN_PASSWORD` | Administración | Contraseña; no versionar. |
| `ADMIN_TOKEN` | Escritura | Token aleatorio largo; sin él se deshabilitan escrituras. |
| `COOKIE_SECURE` | Según entorno | `true` con HTTPS; `false` solo en HTTP interno controlado. |
| `GOOGLE_SA_JSON` | Drive, opcional | JSON completo de cuenta de servicio con acceso de lectura. |
| `DRIVE_CATALOG_FOLDER_ID` | Drive, opcional | Identificador de la carpeta raíz de catálogos. |
| `DRIVE_SYNC_INTERVAL_MINUTES` | Drive, opcional | Intervalo de sincronización; valor por defecto `10`. |
| `VITE_STATIC_SITE` | Build estático | Activa la modalidad de solo lectura. |
| `VITE_BASE_PATH` | Build o imagen | Ruta base pública; producción de servidor usa `/catalogos/`. |

Las variables de Gemini, GCS y Firebase presentes en ejemplos o dependencias no forman parte del almacenamiento operativo actual.

## Validación previa común

Desde la raíz del repositorio:

```bash
npm ci
npm run lint
npm run build
npm run build:pages
```

Antes de producción:

- Comprobar que `git status` no incluye `.env`, respaldos, credenciales ni logs.
- Revisar el cambio de esquema o contenido y actualizar los documentos `00` a `06`.
- Respaldar el `DATA_DIR` de la instancia completa.
- Probar inicio, catálogos, búsqueda, visor y, si aplica, login y una operación administrativa no destructiva.

## Automatización vigente en GitHub

El repositorio no contiene actualmente un workflow de GitHub Pages. Al enviar
cambios a `main` se ejecutan dos workflows:

- `.github/workflows/deploy.yml`: construye y publica
  `techchaide/catalogos-pdf:latest` y una etiqueta por SHA en Docker Hub.
- `.github/workflows/deploy-server.yml`: vuelve a construir y publicar la
  imagen y después actualiza el servidor por SCP/SSH, esperando que el
  contenedor quede saludable.

Los dos workflows construyen la misma imagen. Deben consolidarse para evitar
trabajo duplicado y posibles carreras sobre la etiqueta `latest`.

### Configuración requerida en GitHub

| Tipo | Nombre |
|---|---|
| Variable | `DOCKERHUB_USERNAME` |
| Secreto | `DOCKERHUB_USERNAME` para el workflow heredado `deploy.yml` |
| Secreto | `DOCKERHUB_TOKEN` |
| Secreto | `VITE_BASE_PATH` para `deploy.yml` |
| Secretos de servidor | `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT`, `SERVER_DEPLOY_PATH` |

En el host, `SERVER_DEPLOY_PATH` debe contener un `.env` válido y Docker debe
tener la red externa `traefik-net`. El compose vigente publica la aplicación
mediante Traefik en `apps.chaide.com`, con interfaz bajo `/catalogos` y rutas
separadas para `/api` y `/storage`.

### Reversión del servidor

1. Identificar la etiqueta `techchaide/catalogos-pdf:<SHA>` de la versión sana.
2. Respaldar los volúmenes antes de cualquier restauración de datos.
3. Fijar temporalmente esa etiqueta en el compose del servidor.
4. Ejecutar `docker compose pull catalogos-pdf` y recrear únicamente el servicio.
5. Verificar el health check, la interfaz, la API y los archivos.
6. Corregir o revertir el commit en `main` para que `latest` vuelva a una versión válida.

## Build estático opcional

El comando `npm run build:pages` continúa disponible, aunque GitHub no lo
publica automáticamente.

El comando `npm run build:pages`:

1. Lee `data/db.json`.
2. Copia los documentos publicados, categorías y banner a JSON estático.
3. Copia `data/uploads`, `data/search-index` y los mapas de caracteres de PDF.js.
4. Construye la SPA de solo lectura en `dist-pages`.

El build no contiene `/admin`, `/login` ni la API. Un cambio hecho en una
instancia administrativa o sincronizado desde Drive no aparece en el snapshot
hasta exportarlo a `data/` y ejecutar un nuevo build. Si se decide usar GitHub
Pages, primero se debe añadir y revisar un workflow específico.

## Ejecución local

```bash
npm install
npm run dev
```

La aplicación queda en `http://localhost:3000`. Para probar administración, crear un `.env` local basado en `.env.example` con credenciales no compartidas.

## Despliegue de aplicación completa en el servidor actual

El `docker-compose.yml` está orientado al servidor de producción con Traefik y
usa la imagen publicada en Docker Hub; no es un compose genérico de desarrollo.

1. Crear la red externa `traefik-net` si la plataforma aún no la tiene.
2. Crear `.env` en el directorio de despliegue con credenciales, Drive y cookie.
3. Autenticar Docker Hub en el host.
4. Ejecutar:

   ```bash
   docker compose pull catalogos-pdf
   docker compose up -d catalogos-pdf
   ```

5. Verificar:

   ```bash
   docker compose ps
   docker compose logs --tail=200 catalogos-pdf
   ```

6. Abrir `/api/health`, `/catalogos/` y `/catalogos/admin` en el dominio.
7. Probar login, catálogo y persistencia.

Los volúmenes vigentes son `catalogos_data`, montado en `/app/data`, y
`catalogos_storage`, montado en `/app/storage`. No deben eliminarse durante una
actualización.

## Despliegue en un proveedor Node

Configuración de referencia:

- Build: `npm ci && npm run build`
- Start: `npm run start`
- Runtime: Node.js 22
- Health check: `/api/health`
- Directorio persistente: montar un volumen y asignarlo a `DATA_DIR`; Railway puede usar `RAILWAY_VOLUME_MOUNT_PATH`
- Variables: credenciales administrativas, cookie y, opcionalmente, variables de Drive

No usar almacenamiento efímero para `DATA_DIR`. No ejecutar varias réplicas contra copias independientes ni contra el mismo `db.json` sin migrar previamente a una base de datos adecuada.

## Actualización segura de la instancia completa

1. Anunciar una ventana de mantenimiento si habrá operaciones editoriales.
2. Detener escrituras administrativas.
3. Crear y verificar un respaldo de `DATA_DIR`.
4. Registrar imagen, commit o versión que está en producción.
5. Obtener la nueva versión y reconstruir.
6. Iniciar el servicio conservando el mismo volumen y variables.
7. Verificar salud, logs, conteo de documentos, archivos, búsqueda y login.
8. Si falla, volver a la imagen o commit anterior y restaurar datos solo si una migración o escritura los alteró.
9. Registrar el resultado en `05_REGISTRO_DE_CAMBIOS.md`.

## Respaldo

### Alcance mínimo obligatorio

Respaldar como una unidad:

- `DATA_DIR/db.json`
- `DATA_DIR/uploads/`
- `DATA_DIR/search-index/`
- configuración operativa necesaria para reconstruir el servicio, sin mezclar secretos en la copia pública

`logs.txt` es opcional para recuperación, pero recomendable para diagnóstico. El repositorio Git no sustituye el respaldo del volumen cuando la administración ha realizado cambios no sincronizados.

### Respaldo de una instalación por directorio

Detener temporalmente escrituras. En PowerShell, usando rutas absolutas verificadas:

```powershell
$Source = "C:\ruta\al\data"
$Destination = "D:\respaldos\chaide-data-AAAA-MM-DD-HHMM.zip"
Compress-Archive -LiteralPath $Source -DestinationPath $Destination
Get-FileHash -Algorithm SHA256 -LiteralPath $Destination
```

Guardar el hash junto a la copia. Proteger el destino con los permisos y cifrado definidos por la organización.

### Respaldo de volumen Docker

La estrategia preferida es detener el contenedor y usar la herramienta de snapshots del host o proveedor. Si se exporta manualmente, se debe:

1. Confirmar el nombre real del volumen con `docker volume ls`.
2. Detener `catalogos-pdf` para obtener una copia consistente.
3. Montar el volumen en un contenedor temporal de confianza.
4. Crear un archivo comprimido en un directorio de respaldos del host.
5. Calcular hash, conservar registro y reiniciar el servicio.

No se proporciona un comando destructivo genérico porque los nombres y rutas dependen del host. El operador debe verificar origen y destino antes de ejecutar.

### Frecuencia sugerida

- Antes de cada despliegue, reemplazo masivo o migración.
- Diario si existe edición frecuente.
- Semanal si el contenido cambia poco.
- Retención inicial sugerida: 7 diarias, 4 semanales y 6 mensuales, sujeta a política corporativa.

Mantener al menos una copia fuera del host de producción.

## Restauración y prueba

1. Preparar un host o entorno temporal con la misma versión de la aplicación.
2. Detener el servicio.
3. Conservar una copia del estado actual.
4. Restaurar el contenido completo de `DATA_DIR`, no solo `db.json`.
5. Iniciar el servicio con las variables correctas.
6. Verificar `/api/health`.
7. Comparar conteo de documentos y categorías.
8. Abrir una muestra de PDFs locales.
9. Probar búsqueda, portada, banner y login.
10. Registrar fecha, copia usada, hash, responsable y resultado.

Un respaldo no se considera válido hasta haber completado una restauración de prueba.

## Monitoreo mínimo

- Disponibilidad de `/api/health`.
- Errores y reinicios del proceso.
- Espacio libre del volumen.
- Crecimiento de `uploads/` y `search-index/`.
- Resultado de `Build & Push Docker Image` y `Build and deploy server`.
- Estado de la última sincronización con Google Drive.
- Fecha y estado del último respaldo comprobado.
- Apertura de una muestra de PDFs después de cada despliegue.

## Lista de comprobación posterior

- [ ] Sitio responde y muestra estilos/recursos.
- [ ] Catálogos y categorías tienen el conteo esperado.
- [ ] Un PDF local y uno externo se abren.
- [ ] La búsqueda lleva a la página correcta.
- [ ] El banner se presenta correctamente en escritorio y móvil.
- [ ] El administrador inicia y cierra sesión.
- [ ] Una lectura administrativa no devuelve `401` o `503`.
- [ ] No hay errores nuevos críticos en logs.
- [ ] El volumen sigue montado.
- [ ] Se registró versión, respaldo y resultado.
