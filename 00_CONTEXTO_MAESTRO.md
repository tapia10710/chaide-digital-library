# 00 — Contexto maestro

> **Aviso de actualización manual:** este documento no se sincroniza automáticamente con el código. Debe revisarse en cada versión, despliegue o decisión funcional importante. Última revisión manual: **17 de julio de 2026**.

## Propósito

Chaide Biblioteca Digital es una aplicación web para centralizar, publicar, buscar y visualizar catálogos comerciales en PDF. La experiencia pública permite descubrir catálogos por categoría, buscar contenido dentro de sus páginas y consultarlos en un visor. La experiencia administrativa permite mantener el contenido sin editar el código fuente.

## Qué estamos construyendo

El producto tiene dos modalidades de ejecución:

1. **Aplicación completa con backend Express.** Es la modalidad principal. Sirve la interfaz React, la API, la autenticación administrativa, la sincronización opcional con Google Drive y los archivos persistentes. Puede ejecutarse localmente, con Docker, Railway o un servidor propio.
2. **Build estático opcional.** Genera una copia de solo lectura desde los datos versionados. Incluye catálogo, categorías, portadas, PDFs, banner, búsqueda e índices; no incluye inicio de sesión ni administración. El repositorio conserva el comando de build, pero actualmente no contiene un workflow activo de GitHub Pages.

## Objetivos del producto

- Reunir los catálogos vigentes de Chaide en una biblioteca única.
- Ofrecer una navegación rápida en escritorio y móvil.
- Permitir búsqueda global dentro del texto indexado de los PDFs.
- Facilitar la carga, edición, reemplazo y eliminación de catálogos.
- Administrar categorías y el banner promocional.
- Mantener una publicación pública estable y separada del panel administrativo.
- Poder recuperar datos y archivos ante una actualización fallida.

## Alcance actual

### Incluido

- Inicio editorial con banner y catálogos destacados o sugeridos.
- Listado general y agrupación por categorías.
- Visor de PDF con navegación, miniaturas, búsqueda e índice.
- Búsqueda global con enlace directo a página y término buscado.
- Diseño adaptable a escritorio y móvil.
- Inicio y cierre de sesión de un administrador.
- Carga de PDFs por partes, importación por URL o embed y reemplazo de archivos.
- Edición de metadatos, portada, visibilidad, prioridad, orden y estado.
- Gestión de categorías e iconos.
- Gestión de banner para escritorio y móvil.
- Sincronización periódica y opcional de una carpeta de Google Drive mediante cuenta de servicio.
- Persistencia local basada en `db.json`, archivos subidos e índices de búsqueda.
- Construcción y publicación de imagen Docker mediante GitHub Actions.
- Actualización automática del servidor mediante Watchtower después de publicar `latest`.
- Ejecución en contenedor Docker con volumen persistente.

### Fuera del alcance actual

- Registro de usuarios finales.
- Gestión de múltiples administradores desde la interfaz.
- Recuperación automática de contraseña.
- Flujo de aprobación editorial.
- Historial de auditoría por usuario.
- Base de datos transaccional o almacenamiento externo activo.
- Publicación automática del build estático en GitHub Pages.
- Copias de seguridad automáticas incluidas en la aplicación.
- Analítica de uso y notificaciones.

## Decisiones vigentes

| Decisión | Estado | Motivo o consecuencia |
|---|---|---|
| Frontend con React 19, TypeScript, Vite y React Router | Adoptada | Aplicación SPA con carga diferida de pantallas. |
| Backend con Express en `server.ts` | Adoptada | API, autenticación, archivos y frontend en un mismo servicio. |
| Persistencia principal en archivos bajo `DATA_DIR` | Adoptada | Despliegue sencillo; exige volumen y respaldo del directorio completo. |
| PDF, portadas, banners e iconos en almacenamiento local | Adoptada | No depender de GCS/Firebase en la operación actual. |
| El build estático es de solo lectura | Adoptada | Las rutas `/login` y `/admin` redirigen al inicio y no existe API de escritura. |
| Los datos estáticos se generan antes del build | Adoptada | `scripts/prepare-static-site.mjs` crea el snapshot público. |
| GitHub Pages no tiene workflow activo | Adoptada en `main` | La publicación vigente se orienta a imagen Docker y servidor. |
| Google Drive es una fuente opcional de catálogos | Adoptada | Requiere cuenta de servicio de solo lectura, carpeta compartida y volumen persistente. |
| Una sola cuenta administrativa por variables de entorno | Adoptada | `ADMIN_USERNAME`, `ADMIN_PASSWORD` y `ADMIN_TOKEN` no se guardan en Git. |
| Sesión mediante cookie `HttpOnly`, `SameSite=Strict`, duración de 8 horas | Adoptada | El token no queda accesible al JavaScript del navegador. |
| El servidor Docker persiste `/app/data` y `/app/storage` | Adoptada | Los volúmenes deben conservarse entre reconstrucciones. |
| Índice de búsqueda por documento | Adoptada | Los archivos viven en `data/search-index` o en `DATA_DIR/search-index`. |
| `qpdf` es opcional fuera de Docker | Adoptada | Mejora Fast Web View, pero la aplicación puede funcionar sin él. |
| Documentación y aviso de actualización son manuales | Adoptada | Cada cambio debe actualizar estos archivos y `05_REGISTRO_DE_CAMBIOS.md`. |

## Arquitectura resumida

```text
Navegador
  ├─ Build estático opcional: React + snapshot JSON + archivos públicos
  └─ Servidor completo (modalidad principal): React
                        └─ Express API
                           ├─ autenticación por cookie
                           ├─ sincronización opcional con Google Drive
                           ├─ db.json
                           ├─ uploads/
                           └─ search-index/
```

## Fuentes de verdad

- Código y configuración: repositorio Git.
- Datos de la instancia completa: contenido de `DATA_DIR`.
- Datos del build estático: snapshot generado desde `data/`.
- Secretos: variables del entorno del servidor o archivo `.env` local no versionado.
- Estado de trabajo y decisiones: esta serie de documentos `00` a `06`.
- Historial técnico: commits de Git y `05_REGISTRO_DE_CAMBIOS.md`.

## Criterio de versión lista

Una versión se considera lista cuando:

- `npm run lint` y `npm run build` terminan correctamente.
- La navegación pública, el visor y la búsqueda funcionan.
- En la modalidad completa, el inicio de sesión y las operaciones administrativas críticas fueron probados.
- El directorio persistente fue respaldado antes de una actualización de producción.
- Los secretos no aparecen en archivos rastreados por Git.
- Se actualizan la fecha de estos documentos, el plan y el registro de cambios.

## Riesgos conocidos

- El build estático no recibe automáticamente los cambios hechos desde el panel administrativo.
- Perder el volumen o `DATA_DIR` implica perder los cambios posteriores al último respaldo.
- `db.json` se escribe como archivo completo y no está diseñado para escrituras concurrentes de varias instancias.
- La autenticación actual cubre una sola cuenta y no ofrece permisos granulares.
- Los PDFs y recursos pueden aumentar considerablemente el tamaño del repositorio, la imagen y el artefacto estático.
- La publicación de imagen depende de Docker Hub; la actualización del servidor depende de Watchtower, su autenticación al registro, la red Traefik y un `.env` existente en el host.
- `firestore.rules` permite acceso abierto, pero Firebase/Firestore no es la persistencia operativa actual; no debe desplegarse esa regla en producción sin endurecerla.

## Regla de mantenimiento

Quien apruebe o implemente una modificación debe, en la misma rama o pull request:

1. Actualizar los documentos afectados.
2. Cambiar su fecha de “Última revisión manual”.
3. Añadir una entrada en `05_REGISTRO_DE_CAMBIOS.md`.
4. Marcar como resuelto, movido o nuevo cualquier pendiente de `01_PLAN_DE_TRABAJO.md`.
5. Confirmar si el cambio requiere nuevo respaldo, variable de entorno o instrucción de despliegue.
