# 03 — Modelo de datos

> **Aviso de actualización manual:** este modelo es descriptivo y no se genera desde TypeScript. Debe actualizarse junto con cualquier cambio de campos, persistencia o migración. Última revisión manual: **17 de julio de 2026**.

## Persistencia vigente

La instancia completa usa un objeto JSON en memoria y lo persiste íntegramente en:

```text
DATA_DIR/
├─ db.json
├─ logs.txt
├─ search-index/
│  └─ <documentId>.json
└─ uploads/
   ├─ pdfs/
   ├─ covers/
   ├─ banners/
   ├─ categories/
   └─ tmp/
```

Si `DATA_DIR` no está definido, se usa `data/` dentro del proyecto. El compose
de producción monta el volumen `catalogos_data` en `/app/data`; Railway puede
proporcionar la ruta mediante `RAILWAY_VOLUME_MOUNT_PATH`.

## Raíz de `db.json`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `documents` | `Document[]` | Sí | Catálogos y sus metadatos. |
| `categories` | `Category[]` | Sí | Categorías configurables. |
| `promotionalBanner` | `PromotionalBanner \| null` | Sí | Configuración única del banner. |

Al iniciar, el servidor repara colecciones ausentes, categorías predeterminadas y configuración de banner. También migra índices y portadas base64 heredadas a archivos separados.

## Entidad `Document`

| Campo | Tipo | Obligatorio | Uso |
|---|---|---:|---|
| `id` | `string` | Sí | Identificador estable y nombre de relación con índice/archivos. |
| `title` | `string` | Sí | Nombre mostrado y criterio de búsqueda. |
| `description` | `string` | Sí | Resumen editorial; puede ser vacío. |
| `category` | `string` | Sí | Categoría textual usada para clasificación. |
| `pageCount` | `number` | Sí | Total de páginas conocido. |
| `coverUrl` | `string` | Sí | Ruta local, URL o imagen compatible. |
| `fileUrl` | `string` | Sí | Ruta del PDF, URL o contenido embebido. |
| `externalUrl` | `string` | No | URL externa complementaria. |
| `tags` | `string[]` | Sí | Etiquetas de búsqueda o presentación. |
| `isFeatured` | `boolean` | No | Destacado editorial. |
| `status` | `ready \| processing \| error` | No | Estado técnico/editorial. |
| `sourceType` | `upload \| url \| embed \| drive` | No | Origen del contenido. |
| `visibility` | `string` | No | Visibilidad editorial; los datos históricos mezclan capitalización/idioma. |
| `priority` | `number` | No | Prioridad de presentación. |
| `isActive` | `boolean` | No | Activo para la publicación pública. |
| `order` | `number` | No | Orden manual. |
| `fileSize` | `number` | No | Tamaño del archivo en bytes. |
| `indexItems` | `IndexItem[]` | No | Índice o tabla de contenido del catálogo. |
| `updatedAt` | fecha ISO 8601 | No | Última modificación conocida. |
| `isDeleted` | `boolean` | Heredado | Registros antiguos marcados como eliminados; la eliminación actual es permanente. |
| `linearized` | `boolean` | Interno | Indica que el PDF local fue procesado para Fast Web View. |
| `driveFileId` | `string` | Drive | Identificador del archivo sincronizado. |
| `driveModifiedTime` | fecha ISO 8601 o `null` | Drive | Versión observada en Drive. |
| `driveMd5Checksum` | `string \| null` | Drive | Firma utilizada para detectar cambios. |

### Reglas de publicación

La lista pública del backend excluye elementos eliminados, no activos o no listos. El build estático incluye documentos que no estén eliminados y tengan `status === "ready"`; por ello debe verificarse la consistencia de `isActive` en el snapshot antes de publicar.

### `IndexItem`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador dentro del documento. |
| `title` | `string` | Título detectado o editado. |
| `pageNumber` | `number` | Página de destino, comenzando en 1. |
| `level` | `number` | Nivel jerárquico. |
| `source` | `auto \| ocr` | Procedencia de la detección. |
| `score` | `number` | Puntuación de relevancia del detector. |

## Entidad `Category`

| Campo | Tipo | Obligatorio | Uso |
|---|---|---:|---|
| `id` | `string` | Sí | Identificador único. |
| `name` | `string` | Sí | Nombre visible. |
| `slug` | `string` | Sí | Segmento utilizado en `/categoria/:slug`. |
| `description` | `string` | No | Texto introductorio. |
| `icon` | `string` | No | Clave del registro de iconos. |
| `imageUrl` | `string` | No | Imagen personalizada para la categoría. |
| `order` | `number` | No | Orden ascendente de presentación. |
| `active` | `boolean` | No | Visible salvo que sea `false`. |
| `createdAt` | fecha ISO 8601 | No | Fecha de creación. |
| `updatedAt` | fecha ISO 8601 | No | Fecha de modificación. |

El `slug` debe ser único, estable, minúsculo y apto para URL. Cambiarlo modifica los enlaces públicos.

## Entidad `PromotionalBanner`

| Campo | Tipo | Obligatorio | Uso |
|---|---|---:|---|
| `imageUrl` | `string` | Sí | Imagen principal para escritorio. |
| `mobileImageUrl` | `string` | No | Variante vertical para móvil. |
| `mobileIsActive` | `boolean` | No | Activa la variante móvil. |
| `altText` | `string` | Sí | Texto alternativo accesible. |
| `targetUrl` | `string` | No | Destino al seleccionar el banner. |
| `isActive` | `boolean` | Sí | Activa el banner. |
| `updatedAt` | fecha ISO 8601 | No | Última modificación. |

## Índice de búsqueda persistido

Cada documento puede tener `search-index/<documentId>.json`:

| Campo | Tipo | Descripción |
|---|---|---|
| `stamp` | `string` | Firma utilizada para saber si el índice corresponde al PDF actual. |
| `pages` | `{ pageNumber: number, text: string }[]` | Texto extraído por página. |

El índice se regenera cuando cambia el documento o falta el archivo. En el build estático estos índices se copian a `public/static-data/search-index`.

## Usuario y sesión

El usuario mostrado por la interfaz tiene:

| Campo | Tipo |
|---|---|
| `id` | `string` |
| `email` | `string` |
| `name` | `string` |
| `role` | `guest \| user \| admin` |
| `avatarUrl` | `string`, opcional |

El objeto se guarda en `localStorage` bajo `chaide-digital-library-user` para estado visual. La autorización real no proviene de ese objeto: el servidor valida la cookie `chaide_admin` contra `ADMIN_TOKEN`.

Las credenciales no forman parte del modelo persistido. Se suministran mediante:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN`

## Datos generados para el build estático

`npm run build:pages` genera temporalmente:

```text
public/static-data/documents.json
public/static-data/categories.json
public/static-data/promotional-banner.json
public/static-data/search-index/
public/storage/
public/cmaps/
```

Estas rutas están ignoradas por Git porque son artefactos de build. El origen versionado continúa siendo `data/`.

## Sincronización con Google Drive

Cuando está configurada, la carpeta raíz y sus subcarpetas aportan PDFs. Las
subcarpetas se convierten en categorías; el archivo se descarga al volumen,
su miniatura se almacena como portada permanente y los metadatos `drive*`
permiten detectar modificaciones. Los archivos obtenidos de Drive forman parte
del respaldo del volumen, aunque puedan volver a descargarse.

## Integridad y migraciones

- Un `Document.id` no debe reutilizarse para catálogos distintos.
- Toda ruta `/storage/...` debe corresponder a un archivo dentro de `DATA_DIR/uploads`.
- Reemplazar un PDF debe actualizar o regenerar su índice.
- El respaldo debe capturar `db.json`, `uploads/` y `search-index/` como una sola unidad consistente.
- Antes de añadir o renombrar campos se debe mantener compatibilidad con registros existentes o crear una migración al inicio.
- No se deben editar simultáneamente los mismos datos desde varias réplicas del servidor.
