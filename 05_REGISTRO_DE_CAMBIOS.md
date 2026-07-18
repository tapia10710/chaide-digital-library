# 05 — Registro de cambios

> **Aviso de actualización manual:** añadir una entrada en este archivo antes de integrar cada versión. El historial de Git sigue siendo el detalle técnico; este documento resume cambios operativos y funcionales. Última revisión manual: **17 de julio de 2026**.

El proyecto usa por ahora versiones fechadas. Cuando exista una política de lanzamientos, se recomienda adoptar versionado semántico (`MAJOR.MINOR.PATCH`) y etiquetas Git.

## [Sin publicar] — 2026-07-17

### Documentación

- Se creó el contexto maestro del producto y se registraron decisiones vigentes.
- Se añadió el plan por fases, prioridades, decisiones pendientes y definición de terminado.
- Se documentaron pantallas, rutas, recorridos y diferencias entre Pages y servidor completo.
- Se formalizó el modelo de datos, archivos persistentes e índices.
- Se añadió la matriz de roles, permisos y limitaciones de autenticación.
- Se creó la guía de despliegue, actualización, reversión y respaldo.
- Se incorporó en todos los documentos un aviso de actualización manual.
- Se añadió al README un índice de la documentación operativa.
- Se reconcilió la documentación con los workflows vigentes de Docker/servidor y con la sincronización opcional de Google Drive.
- Se aclaró que el repositorio conserva el build estático, pero no un workflow activo de GitHub Pages.

### Impacto operativo

- Sin cambios en la aplicación, API ni datos.
- No requiere migración ni despliegue inmediato.

## [2026-06-23] — Autohospedaje y despliegue administrativo

Commits de referencia: `53e939a`, `6a5af96`.

### Añadido

- Dockerfile multietapa basado en Node.js 22.
- Docker Compose con volumen persistente y puerto configurable.
- Variables `DATA_DIR`, `COOKIE_SECURE`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` y `ADMIN_TOKEN`.
- Soporte para servidor interno, nube o plataforma Node.
- Preparación de despliegue administrativo en Railway.

### Cambiado

- Los datos persistentes pueden separarse del código mediante `DATA_DIR`.
- La cookie administrativa puede funcionar en HTTP interno con configuración explícita.
- La imagen Docker incluye `qpdf` para optimizar PDFs.

### Precaución

- El volumen persistente debe respaldarse y conservarse al reconstruir el contenedor.
- `COOKIE_SECURE=false` no debe usarse en una instancia pública sin una justificación de red controlada.

## [2026-06-22] — Publicación inicial

Commit de referencia: `510dff6`.

### Añadido

- Publicación de Chaide Biblioteca Digital.
- Workflow de GitHub Actions para GitHub Pages.
- Versión estática de solo lectura con catálogos, archivos, categorías, búsqueda y visor.
- README con URL pública y comandos básicos.

## Plantilla para próximas versiones

```markdown
## [versión o Sin publicar] — AAAA-MM-DD

### Añadido
- ...

### Cambiado
- ...

### Corregido
- ...

### Seguridad
- ...

### Datos y migración
- ...

### Despliegue y reversión
- ...
```

## Reglas del registro

- Describir el efecto para usuarios y operación, no cada archivo modificado.
- Incluir migraciones, variables nuevas, cambios de permisos y efectos en respaldos.
- Añadir identificador de pull request, etiqueta o commit cuando exista.
- No incluir valores de secretos.
- Mover “Sin publicar” a una versión fechada al realizar el lanzamiento.
