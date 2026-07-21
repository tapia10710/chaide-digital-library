# 01 — Plan de trabajo

> **Aviso de actualización manual:** este plan no cambia automáticamente. Debe revisarse al iniciar y cerrar cada fase, versión o despliegue. Última revisión manual: **19 de julio de 2026**.

## Estado general

El producto base está construido y cuenta con backend administrativo, imagen Docker, despliegue a servidor y build estático opcional. El trabajo siguiente se concentra en formalizar operación, seguridad, pruebas, sincronización de contenido y recuperación.

## Fases

### Fase 0 — Base del producto

Estado: **completada**

- [x] Biblioteca pública y navegación adaptable.
- [x] Catálogos y categorías.
- [x] Visor de PDF.
- [x] Búsqueda global e índices por documento.
- [x] Panel administrativo.
- [x] Carga, importación, edición, reemplazo y eliminación de catálogos.
- [x] Banner promocional para escritorio y móvil.
- [x] Persistencia de archivos local.

### Fase 1 — Publicación y portabilidad

Estado: **completada con validaciones pendientes**

- [x] Build estático de solo lectura.
- [x] Build de producción para frontend y servidor.
- [x] Dockerfile multietapa.
- [x] Docker Compose con volumen persistente.
- [x] Variables de entorno de ejemplo.
- [x] Workflow único para publicar imagen Docker.
- [x] Actualización del servidor mediante Watchtower.
- [ ] Configurar un workflow de Pages solo si se decide publicar la modalidad estática.
- [ ] Validar restauración del volumen Docker en un host limpio.
- [ ] Definir la URL oficial de la instancia administrativa.

### Fase 2 — Documentación y entrega operativa

Estado: **en curso**

- [x] Contexto maestro.
- [x] Plan de trabajo.
- [x] Mapa funcional.
- [x] Modelo de datos.
- [x] Matriz de roles y permisos.
- [x] Registro de cambios inicial.
- [x] Guía de despliegue y respaldo.
- [x] Aviso de actualización manual.
- [ ] Asignar propietario y suplente de operación.
- [ ] Registrar ubicación segura de credenciales y respaldos.
- [ ] Ejecutar una prueba de recuperación documentada.

### Fase 3 — Calidad y seguridad

Estado: **en curso**

- [x] Añadir pruebas automatizadas del visor, PDFs y carga administrativa crítica.
- [ ] Añadir validación automatizada del esquema de `db.json`.
- [ ] Aplicar límites de intentos al inicio de sesión.
- [ ] Regenerar `ADMIN_TOKEN` y contraseñas conforme a una política definida.
- [ ] Eliminar código muerto del flujo de login.
- [ ] Definir tamaño máximo, extensiones y política de retención de archivos.
- [ ] Revisar dependencias con una herramienta de auditoría.
- [ ] Endurecer o retirar los archivos Firebase no utilizados antes de cualquier despliegue Firebase.
- [x] Incorporar verificación de enlaces, PDFs faltantes e índices externos.
- [ ] Definir cabeceras de seguridad y terminación HTTPS para producción.

### Fase 4 — Operación y sincronización

Estado: **en curso**

- [x] Definir Firestore como fuente pública dinámica, con PDF interno y Drive como respaldo.
- [x] Respaldar y verificar en Drive los 21 PDFs publicados.
- [x] Permitir restaurar desde Drive y regenerar el índice desde el administrador.
- [ ] Definir cómo exportar al build estático los cambios del panel o Drive, si se activa esa modalidad.
- [ ] Automatizar respaldos de `DATA_DIR`.
- [ ] Definir retención, cifrado y prueba periódica de copias.
- [ ] Incorporar monitoreo de `/api/health`, espacio en disco y errores.
- [ ] Definir ventana y responsable de actualizaciones.
- [ ] Evaluar almacenamiento de objetos y base de datos administrada si aumenta el uso.

## Prioridades inmediatas

| Prioridad | Trabajo | Resultado esperado |
|---|---|---|
| P0 | Guardar los secretos solo en GitHub/host y rotar cualquier secreto que haya sido compartido | No hay credenciales válidas en el repositorio ni en entregables públicos. |
| P0 | Respaldar y restaurar `DATA_DIR` en una prueba real | Recuperación confirmada de metadatos, PDFs, portadas, banners e índices. |
| P1 | Definir sincronización panel/Drive → build estático | Los cambios pueden publicarse de manera repetible si se activa esa modalidad. |
| P1 | Monitorear publicación Docker y actualización Watchtower | Despliegue reproducible desde `main`. |
| P1 | Añadir pruebas de autenticación y CRUD | Menos riesgo de regresiones en administración. |
| P2 | Monitoreo, auditoría y política de retención | Operación mantenible y trazable. |

## Decisiones pendientes

1. ¿Se publicará también una versión estática o únicamente la instancia completa?
2. ¿La instancia definitiva vivirá en el servidor con Traefik, Railway u otro proveedor?
3. ¿Quién autoriza y ejecuta la publicación de contenido?
4. ¿Los cambios hechos en administración deben generar un pull request o una exportación manual?
5. ¿Cuánto tiempo deben conservarse respaldos y catálogos eliminados?
6. ¿Se requiere más de una cuenta administrativa o perfiles editor/aprobador?
7. ¿Cuál es el límite aceptable de tamaño para repositorio, PDFs, imagen y artefacto estático?

## Flujo de trabajo recomendado en GitHub

1. Crear una rama desde `main`.
2. Implementar el cambio sin incluir `.env`, credenciales, respaldos ni archivos temporales.
3. Ejecutar:

   ```bash
   npm ci
   npm run lint
   npm run build
   npm run build:pages
   ```

4. Probar los recorridos afectados.
5. Actualizar esta documentación y el registro de cambios.
6. Abrir un pull request con alcance, prueba realizada, impacto en datos y plan de reversión.
7. Integrar en `main`; el workflow publicará `latest` y Watchtower actualizará el servidor.
8. Vigilar GitHub Actions y seguir `06_DESPLIEGUE_Y_RESPALDO.md`.

## Definición de terminado por cambio

- [ ] Cumple el criterio funcional acordado.
- [ ] No expone secretos ni datos privados.
- [ ] Tiene validación proporcional al riesgo.
- [ ] Documenta variables, migraciones y efectos en respaldo.
- [ ] Actualiza `05_REGISTRO_DE_CAMBIOS.md`.
- [ ] Actualiza la fecha de los documentos afectados.
- [ ] Dispone de una forma clara de reversión.

## Fase Firebase — completada 2026-07-17

- [x] Proyecto, aplicación web y Hosting configurados.
- [x] Firestore creado en `southamerica-east1` y protegido contra borrado.
- [x] 21 documentos, 5 categorías y banner migrados.
- [x] Inicio administrativo con usuario y contraseña habilitado.
- [x] Escrituras restringidas a la cuenta técnica verificada.
- [x] Puente de Google Drive operativo para respaldos e imágenes.
- [x] PDF históricos conservados en Hosting.
- [x] PDF nuevos fragmentados en Firestore y abiertos con el visor integrado.
- [x] Verificación de 21/21 PDF y rechazo de escritura anónima.
- [x] Estabilización del visor: navegación sin carreras, pliegos correctos y caché acotada.
- [x] Publicación validada con índice de búsqueda versionado por PDF.
- [x] Búsqueda general desde el visor y búsqueda interna basada en índices persistentes.

Pendientes operativos:

- [ ] Configurar un dominio personalizado si Chaide decide sustituir la URL `web.app`.
- [ ] Revisar mensualmente el consumo de transferencia gratuita.
- [ ] Exportar periódicamente Firestore y la carpeta de respaldo de Drive.
