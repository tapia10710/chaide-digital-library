# 04 — Roles y permisos

> **Aviso de actualización manual:** esta matriz debe revisarse al añadir pantallas, endpoints, cuentas o tipos de usuario. Última revisión manual: **17 de julio de 2026**.

## Principio de autorización

La interfaz utiliza los roles `guest`, `user` y `admin` para decidir qué controles muestra. El servidor solo reconoce una condición de autorización para escritura: presentar el `ADMIN_TOKEN` correcto mediante la cookie `chaide_admin`, la cabecera `x-admin-token` o el parámetro `adminToken`.

La comprobación del servidor es obligatoria. Modificar `localStorage` puede alterar la interfaz, pero no concede acceso a los endpoints protegidos.

## Roles funcionales

### Invitado (`guest`)

Usuario sin sesión. Es el rol inicial.

### Usuario (`user`)

Rol previsto por el estado del frontend, pero actualmente no tiene autenticación ni permisos adicionales implementados. En la práctica equivale al invitado.

### Administrador (`admin`)

Cuenta única configurada mediante variables del servidor. Puede usar el panel y las operaciones de escritura durante una sesión de hasta ocho horas.

### Operador de infraestructura

No es un rol de la aplicación. Es la persona o sistema con acceso al host, GitHub, variables de entorno, volumen persistente y respaldos. Puede afectar todo el sistema y debe tratarse como acceso privilegiado.

## Matriz

| Acción | Invitado | Usuario | Administrador | Operador |
|---|:---:|:---:|:---:|:---:|
| Ver inicio, catálogos y categorías | Sí | Sí | Sí | Según acceso web |
| Abrir visor y descargar/consultar PDF | Sí | Sí | Sí | Según acceso web |
| Buscar dentro de catálogos | Sí | Sí | Sí | Según acceso web |
| Ver página Acerca de | Sí | Sí | Sí | Según acceso web |
| Acceder visualmente a `/admin` | No | No | Sí | No necesariamente |
| Cargar o importar catálogo | No | No | Sí | Vía administración |
| Editar, reemplazar o eliminar catálogo | No | No | Sí | Vía administración o archivos |
| Administrar categorías | No | No | Sí | Vía administración o archivos |
| Administrar banner | No | No | Sí | Vía administración o archivos |
| Cambiar credenciales | No | No | No desde UI | Sí |
| Desplegar una versión | No | No | No desde UI | Sí |
| Crear/restaurar respaldos | No | No | No desde UI | Sí |
| Publicar build estático | No | No | No desde UI | Sí, si se configura el despliegue |
| Configurar sincronización con Drive | No | No | No desde UI | Sí |

## Protección de endpoints

### Públicos de lectura

- Salud del servicio.
- Listado y detalle de documentos.
- Búsqueda e índices.
- Categorías.
- Banner.
- Archivos locales y proxy PDF, sujetos a validaciones.
- Consulta de estado de sesión y cierre de sesión.

### Públicos con credenciales

- `POST /api/auth/login`: valida `ADMIN_USERNAME` y `ADMIN_PASSWORD`.

### Protegidos por `requireAdmin`

- Carga completa o por partes.
- Importación, edición, indexación, reemplazo y eliminación de documentos.
- Creación, edición, eliminación y carga de iconos de categorías.
- Edición y carga de imágenes del banner.

## Sesión administrativa

- Cookie: `chaide_admin`.
- Propiedades: `HttpOnly`, `SameSite=Strict`, `Path=/`.
- Duración: 28 800 segundos (8 horas).
- `Secure`: activo por defecto en producción; puede desactivarse con `COOKIE_SECURE=false` únicamente para un servidor interno que opere sobre HTTP.
- Cierre: el endpoint de logout expira la cookie.

El valor de la cookie coincide actualmente con `ADMIN_TOKEN`. Debe ser largo, aleatorio, distinto de la contraseña y rotarse si se sospecha exposición.

## Gestión de secretos

- No guardar credenciales en Git, Markdown, imágenes, ZIP de entrega ni mensajes de commit.
- Usar secretos del proveedor de hosting o un `.env` local ignorado.
- Mantener `.env.example` y `.env.docker.example` solo con valores ficticios.
- Restringir quién puede ver o modificar secretos de GitHub y del host.
- Rotar `ADMIN_PASSWORD` y `ADMIN_TOKEN` al cambiar el responsable.
- No incluir secretos dentro de variables `VITE_*`, porque Vite las expone al navegador.
- Guardar `GOOGLE_SA_JSON` únicamente en el entorno del servidor; la cuenta de servicio debe tener solo lectura sobre la carpeta requerida.

## Limitaciones actuales

- Solo existe una identidad administrativa.
- No hay roles editor, aprobador o auditor.
- No hay revocación individual de sesiones; rotar el token invalida todas.
- No hay segundo factor, recuperación de contraseña ni límite de intentos.
- No existe bitácora de quién realizó cada cambio; `logs.txt` registra rutas API, no identidad ni detalle del cambio.
- El rol `user` no aporta permisos diferentes.

## Mejoras recomendadas

1. Aplicar rate limiting y alertas al login.
2. Sustituir el token estático de sesión por identificadores de sesión rotables y almacenados de forma segura.
3. Añadir protección CSRF si se amplía el uso o cambia `SameSite`.
4. Incorporar usuarios nominales, hash de contraseña y mínimo privilegio.
5. Registrar auditoría de altas, cambios, reemplazos y eliminaciones.
6. Usar HTTPS en toda instancia accesible fuera de una red interna controlada.
7. Separar permisos de contenido, publicación e infraestructura.
