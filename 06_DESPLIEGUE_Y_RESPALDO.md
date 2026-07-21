# 06 — Despliegue y respaldo

> **Aviso de actualización manual:** comandos, rutas, responsables y fechas deben comprobarse antes de cada despliegue. Este documento no ejecuta ni programa respaldos. Última revisión manual: **19 de julio de 2026**.

## Producción Firebase vigente

- Sitio: `https://biblioteca-catalogos-chaide.web.app`
- Firestore guarda fichas dinámicas, PDFs por versiones y texto de búsqueda por página.
- Google Drive conserva un respaldo verificado de cada PDF.
- La publicación administrativa valida estructura, páginas y texto antes de activar la ficha.
- Los PDFs grandes se suben y recuperan por bloques; no se envían en una sola respuesta.

Validación y despliegue:

```bash
npm run lint
npm run verify:pdfs
npm run build:firebase
npx firebase-tools deploy --only firestore:rules,hosting --project biblioteca-catalogos-chaide
```

Las pruebas administrativas requieren variables locales ignoradas por Git. Nunca se debe
guardar una contraseña o token en el repositorio.

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
cambios a `main` se ejecuta un único workflow:

- `.github/workflows/deploy-server.yml`: construye y publica
  `tapia10710/catalogos-pdf:latest` y una etiqueta por SHA en Docker Hub.
- Watchtower, ejecutándose en el servidor, consulta `latest` cada 60 segundos,
  actualiza `catalogos-pdf` y limpia la imagen anterior.

### Configuración requerida en GitHub

| Tipo | Nombre |
|---|---|
| Variable | `DOCKERHUB_USERNAME` |
| Secreto | `DOCKERHUB_TOKEN` |

No se requieren secretos SSH en GitHub. En el host, Docker debe estar
autenticado para descargar la imagen y debe existir la red externa
`traefik-net`. El compose vigente publica la aplicación mediante Traefik en
`apps.chaide.com`, con interfaz bajo `/catalogos` y rutas separadas para `/api`
y `/storage`.

### Reversión del servidor

1. Identificar la etiqueta `tapia10710/catalogos-pdf:<SHA>` de la versión sana.
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

## Despliegue vigente en Firebase

```powershell
npm ci
npm run lint
npm run build:firebase
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project biblioteca-catalogos-chaide
npx firebase-tools deploy --only hosting --project biblioteca-catalogos-chaide
```

La compilación genera la aplicación, índices, cMaps y PDF históricos. `.env.firebase` es local y no debe subirse.

- `scripts/migrate-firestore.mjs` restaura metadatos desde `data/db.json`.
- `scripts/verify-firestore-viewer.mjs` reconstruye un PDF temporal desde Firestore, lo abre con PDF.js y lo elimina.

Respaldo: Git conserva código y datos iniciales; Hosting conserva PDF históricos; Firestore contiene metadatos y PDF nuevos; Drive conserva la copia adicional y las imágenes administrativas.

Antes de cada despliegue o cambio masivo se debe generar el respaldo versionable:

```powershell
npm run backup:firestore
```

El resultado se guarda en `backups/firestore-latest.json`. No contiene contraseñas, tokens ni los bytes completos de los PDF; conserva los identificadores de Drive necesarios para reconstruirlos. Las credenciales y copias privadas deben permanecer únicamente en `.env.firebase` o `backups/private/`, ambas fuera de Git.

Los nuevos documentos se crean como borradores privados. El administrador debe abrir su edición, validar portada, visor, índice y metadatos, y cambiar su visibilidad a pública cuando estén aprobados.

GitHub Actions ejecuta compilación, TypeScript, validación de PDF, despliegue de reglas Firestore y despliegue de Hosting. El despliegue automático se activa al configurar el secreto `FIREBASE_SERVICE_ACCOUNT_BIBLIOTECA_CATALOGOS_CHAIDE`; sin ese secreto, la verificación continúa funcionando y el despliegue se realiza con los comandos anteriores.

La cuenta de servicio de GitHub requiere exclusivamente:

- `roles/firebasehosting.admin`
- `roles/firebaserules.admin`
- `roles/serviceusage.serviceUsageConsumer`

Se configura con `npm run configure:github-firebase`. La clave local se escribe en `backups/private/`, fuera de Git, y debe eliminarse de la estación cuando ya no sea necesaria. El secreto de GitHub conserva la copia usada por el workflow.

Si existen documentos históricos con valores localizados como `Público`, ejecutar una sola vez:

```powershell
npm run migrate:publication-fields
```

El comando conserva borradores explícitos y normaliza únicamente los campos de publicación faltantes o heredados.
## Publicación validada de un PDF

1. Validar título, descripción, categoría, tamaño y firma PDF.
2. Comprobar todas las páginas y calcular `pageCount`.
3. Extraer y limpiar el texto por página.
4. Guardar la versión del índice en Firestore.
5. Guardar los fragmentos del PDF y su manifiesto.
6. Crear el respaldo de Drive y la portada cuando estén disponibles.
7. Guardar el documento como `ready` con la versión de índice vigente, `driveFileId`, `coverFileId` e índice lateral.
8. Actualizar la biblioteca y ejecutar `npm run verify:pdfs`.

La eliminación desde el administrador borra primero y de forma secuencial el PDF y la portada administrados en Drive. El puente verifica que pertenezcan a la carpeta de respaldo y los elimina definitivamente, porque una copia pública enviada solamente a la papelera puede continuar accesible mediante su enlace anterior.
