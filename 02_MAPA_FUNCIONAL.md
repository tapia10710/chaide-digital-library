# 02 — Mapa funcional

> **Aviso de actualización manual:** rutas y recorridos deben actualizarse aquí cuando cambien las pantallas o la navegación. Última revisión manual: **21 de julio de 2026**.

## Modalidades

| Modalidad | Enrutador | Lectura | Administración |
|---|---|---|---|
| Aplicación completa | `BrowserRouter` | API Express y `/storage` | Disponible con sesión válida |
| Build estático opcional | `HashRouter` | JSON y archivos del snapshot estático | Deshabilitada |

## Pantallas

| Ruta | Pantalla | Acceso | Función principal |
|---|---|---|---|
| `/` | Inicio | Público | Banner, contenido editorial y catálogos sugeridos. |
| `/catalogos` | Todos los catálogos | Público | Explorar el catálogo agrupado por secciones. |
| `/categorias` | Categorías | Público | Ver las categorías activas y entrar a una de ellas. |
| `/categoria/:slug` | Detalle de categoría | Público | Ver catálogos que corresponden a la categoría. |
| `/buscar?q=...` | Resultados de búsqueda | Público | Buscar texto en los índices de páginas y abrir un resultado. |
| `/viewer/:id` | Visor | Público | Leer el catálogo, navegar y buscar dentro del PDF. |
| `/acerca-de` | Acerca de | Público | Presentar el propósito y capacidades de la biblioteca. |
| `/login` | Inicio de sesión | Servidor completo | Autenticar al administrador. En el build estático redirige a `/`. |
| `/admin` | Panel administrador | Administrador | Gestionar catálogos, categorías y banner. En el build estático redirige a `/`. |

`src/pages/AdminCategoriesPage.tsx` existe en el código, pero no tiene una ruta activa en `src/App.tsx`; la gestión vigente de categorías está integrada en `/admin`.

## Navegación pública

- **Cabecera:** logo/inicio, catálogos, búsqueda, acceso o cierre de sesión y acceso al panel si el rol local es administrador.
- **Barra lateral:** inicio, catálogos, categorías activas y administración para el rol administrador.
- **Navegación móvil inferior:** inicio, catálogos y acerca de.
- **Tarjetas y carruseles:** abren la vista previa o el visor del catálogo.

## Recorridos principales

### 1. Explorar un catálogo

```text
Inicio o Catálogos
  → seleccionar tarjeta
  → Visor
  → cambiar página / miniaturas / zoom
  → cerrar
  → volver a la biblioteca
```

### 2. Explorar por categoría

```text
Barra lateral, Categorías o Catálogos
  → seleccionar categoría
  → ver catálogos coincidentes
  → seleccionar catálogo
  → Visor
```

Solo se presentan categorías con `active !== false`; el orden usa el campo `order`.

### 3. Buscar contenido

```text
Cabecera
  → escribir consulta
  → /buscar?q=consulta
  → resultados por catálogo y página
  → seleccionar resultado
  → /viewer/:id?page=N&search=consulta
```

- En la aplicación completa, la búsqueda principal consulta `/api/search`.
- En el build estático, el navegador consulta los índices JSON incluidos en el snapshot.

### Sincronización automática con Google Drive

```text
Temporizador del servidor
  → listar PDFs en la carpeta y subcarpetas configuradas
  → descargar archivos nuevos o modificados
  → crear categorías según carpetas
  → guardar portada permanente
  → actualizar db.json
  → regenerar índice de búsqueda
```

No es una pantalla. Se activa únicamente si existen `GOOGLE_SA_JSON` y
`DRIVE_CATALOG_FOLDER_ID`; el intervalo se define con
`DRIVE_SYNC_INTERVAL_MINUTES`.

### 4. Iniciar y cerrar sesión administrativa

```text
/login
  → enviar usuario y contraseña
  → POST /api/auth/login
  → cookie administrativa HttpOnly
  → estado local del usuario
  → /admin

Cabecera → cerrar sesión
  → POST /api/auth/logout
  → borrar estado local
  → /login
```

El backend es la autoridad para operaciones protegidas. Ocultar controles en la interfaz no reemplaza la validación `requireAdmin`.

### 5. Publicar un PDF local

```text
/admin
  → Gestor de carga estructurada
  → seleccionar uno o varios PDF
  → carga por partes
  → crear metadatos y portada
  → generar índice
  → establecer estado ready
  → refrescar biblioteca
```

El servidor puede linealizar el PDF con `qpdf` y construir su índice de búsqueda en segundo plano.

### 6. Importar mediante URL o embed

```text
/admin
  → Importar mediante URL o Embed
  → agregar elementos
  → enviar
  → crear documento con fuente url/embed
  → editar metadatos si corresponde
```

Los PDFs externos se consumen mediante el proxy seguro cuando el visor lo necesita. El proxy limita protocolos, redirecciones, tamaño y acceso a redes privadas.

### 7. Editar, reemplazar o eliminar catálogo

```text
/admin → localizar catálogo
  ├─ editar → metadatos/portada/estado/orden → guardar
  ├─ reemplazar → cargar PDF nuevo → intercambiar contenido → limpiar archivo anterior
  └─ eliminar → confirmar → borrar registro y archivo local asociado
```

Antes de reemplazar o eliminar contenido de producción se debe ejecutar un respaldo.

### 8. Administrar categorías

```text
/admin
  → Gestión de Categorías
  → crear o editar nombre, slug, descripción, icono, imagen, orden y estado
  → guardar
```

Las categorías predeterminadas no pueden eliminarse desde la API.

### 9. Administrar banner

```text
/admin
  → Banner Promocional
  → subir imagen de escritorio y, opcionalmente, móvil
  → configurar texto alternativo, enlace y estados
  → guardar
```

## Servicios API por función

| Función | Rutas principales |
|---|---|
| Salud | `GET /api/health` |
| Sesión | `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` |
| Catálogos | `GET /api/documents`, `GET /api/documents/:id`, carga, importación, edición, reemplazo, indexación y eliminación |
| Búsqueda | `GET /api/search`, `GET /api/documents/:id/search-index` |
| Categorías | `GET /api/categories`, creación, edición, eliminación y carga de icono |
| Banner | `GET /api/promotional-banner`, edición y carga de imagen |
| Archivos | `/storage/*`, `/api/local-pdf`, `/api/pdf-proxy` |

Todas las rutas de escritura requieren `requireAdmin`.

## Estados relevantes para la interfaz

- Documento `ready`: publicado y visible para el público si está activo.
- Documento `processing`: carga o procesamiento pendiente.
- Documento `error`: archivo no válido, inexistente o procesamiento fallido.
- Categoría `active: false`: no se muestra en navegación pública.
- Documento `isActive: false`: se excluye de la vista pública.
- Banner `isActive: false`: no se presenta.
- Banner móvil: se utiliza solo cuando `mobileIsActive` y `mobileImageUrl` lo permiten.

## Recorridos vigentes en Firebase

```text
Inicio → Firestore → catálogo → /viewer/:id
  → PDF histórico: /storage/*.pdf
  → PDF nuevo: reconstrucción desde Firestore
  → visor profesional PDF.js
```

Todos los PDF publicados utilizan el visor integrado. Google Drive no se utiliza como visor principal.

```text
/login → usuario y contraseña → Firebase Authentication → reglas Firestore → /admin
```

Al publicar un PDF nuevo, la aplicación lo divide en fragmentos seguros para Firestore, publica el manifiesto y crea un respaldo adicional en Google Drive cuando el puente está disponible.

## Asistente de catálogos

```text
Cualquier pantalla pública
  → botón flotante “Pregúntame”
  → pregunta libre sobre productos o especificaciones
  → carga de índices persistidos (sin descargar los PDF)
  → recuperación de páginas relevantes
  → respuesta basada únicamente en fragmentos del catálogo
  → fuente “Catálogo · Página N”
  → /viewer/:id?page=N&search=termino
```

Si la información no existe en los índices publicados, el asistente lo indica expresamente y no completa la respuesta con conocimiento externo.

## Control automático de PDF futuros

```text
/admin → seleccionar PDF
  → validar firma, páginas, texto y portada
  → contar imágenes y máscaras por página
  → complejidad normal: publicar el PDF original en el visor
  → complejidad alta: generar copia web aplanada
  → guardar copia web en Firestore
  → conservar original sin cambios en Drive
  → publicar el mismo índice textual extraído del original
```
