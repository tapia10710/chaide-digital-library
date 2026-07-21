# 05 — Registro de cambios

> **Aviso de actualización manual:** añadir una entrada en este archivo antes de integrar cada versión. El historial de Git sigue siendo el detalle técnico; este documento resume cambios operativos y funcionales. Última revisión manual: **19 de julio de 2026**.

El proyecto usa por ahora versiones fechadas. Cuando exista una política de lanzamientos, se recomienda adoptar versionado semántico (`MAJOR.MINOR.PATCH`) y etiquetas Git.

## [Firebase 1.2.0] — 2026-07-19

### Añadido

- Publicación administrativa transaccional con versiones independientes del PDF y del índice.
- Respaldo obligatorio en Google Drive antes de activar un catálogo nuevo o reemplazado.
- Subida reanudable y recuperación por bloques para PDFs de hasta 35 MB.
- Reparación administrativa desde Drive con nueva validación de páginas y regeneración del índice.
- Prueba integral `verify:admin-upload` para autenticación, Firestore, visor, búsqueda, descarga y Drive.
- Migración `backfill:drive` para respaldar y verificar los catálogos históricos.

### Corregido

- Un fallo a mitad de reemplazo ya no elimina la versión pública anterior.
- La publicación ya no queda marcada como correcta si falla el respaldo.
- El buscador usa el texto persistido y versionado sin esperar a abrir todos los PDFs.
- La eliminación retira también versiones, fragmentos, índices y respaldo de Drive.
- Se evitó el bloqueo de Apps Script al transferir PDFs grandes en una sola petición.
- La subida espera la restauración real de la sesión Firebase después de recargar el administrador.
- Los PDFs con tipo MIME vacío o genérico en Windows se aceptan por extensión y se validan por firma interna.
- El formulario de carga ya no deja el botón gris sin explicación: autocompleta título y descripción, enumera los campos pendientes y muestra validaciones al pulsar.

### Verificación

- Prueba administrativa real: 8 páginas, 2 fragmentos, 8 páginas de índice, búsqueda y hashes válidos.
- Biblioteca: 21/21 respaldos de Drive descargados y comparados por SHA-256.

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

- Se corrigió el namespace de la imagen Docker de `techchaide` a
  `tapia10710`, correspondiente a la cuenta configurada en GitHub Actions.
- Se consolidaron los workflows Docker en uno solo y se retiró el job SSH no
  configurado; el servidor se actualiza mediante Watchtower.
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

## [Firebase 1.0.0] — 2026-07-17

### Añadido

- Producción en Firebase Hosting, Firestore y Authentication con usuario y contraseña.
- Publicación y reemplazo de PDF mediante fragmentación para el visor integrado.
- Respaldo adicional mediante Apps Script y Google Drive.
- Scripts de migración y verificación del visor Firestore.

### Corregido

- Sustituida una configuración Firebase que apuntaba a otro proyecto.
- Los PDF históricos usan directamente `/storage/` y no `/api/local-pdf`.
- Eliminadas las reglas abiertas de Firestore.

### Datos y validación

- Migrados 21 documentos, 5 categorías y el banner.
- Verificados 21/21 PDF, bloqueo de escritura anónima y rutas públicas.
- URL: `https://biblioteca-catalogos-chaide.web.app`.

## [Firebase 1.0.1] — 2026-07-17

### Corregido

- Eliminados los saltos provocados por navegaciones y temporizadores superpuestos.
- Normalizados los saltos a pliegos dobles: portada, 2-3, 4-5 y siguientes.
- El control deslizante navega al soltarlo y no durante cada movimiento.
- El visor reinicia de forma segura la página, búsqueda, zoom e índice al cambiar de catálogo.
- Los parámetros de página inválidos ya no producen posiciones indeterminadas.

### Rendimiento y validación

- La rasterización queda limitada a las páginas cercanas a la lectura actual.
- La caché conserva como máximo 4 documentos y 16 páginas renderizadas por documento.
- Verificados tipos, build Firebase, reconstrucción Firestore y apertura de los 20 PDF locales (658 páginas).

## [Firebase 1.0.2] — 2026-07-17

### Rendimiento del visor

- Eliminada la descarga anticipada de catálogos completos desde la biblioteca.
- La red queda reservada al PDF que el usuario tiene abierto.
- El visor rasteriza la página actual, su pliego y una ventana de dos páginas anteriores y cuatro siguientes.
- Los canvas fuera de la ventana activa se cancelan y liberan para reducir memoria gráfica.
- La caché queda limitada al catálogo actual, el anterior y diez páginas renderizadas por documento.
- Las miniaturas se conservan en una caché acotada de 24 elementos.

### Experiencia de carga

- Añadido progreso visible para PDF almacenados en Firestore.
- Añadida barra de progreso durante la descarga y preparación general.
- Cada página muestra su propio estado mientras se rasteriza.

## [Firebase 1.0.3] — 2026-07-19

### Recuperación automática del visor

- Cada página dispone de límite de tiempo y tres intentos rápidos de lectura y rasterización.
- Si los intentos rápidos fallan, la página continúa recuperándose automáticamente con espera progresiva mientras siga visible.
- El PDF completo realiza tres intentos controlados y vuelve a conectarse automáticamente si el origen sigue temporalmente indisponible.
- Las cargas fallidas se eliminan de la caché para impedir que una promesa rechazada dañe las recargas posteriores.
- La recuperación no necesita botones ni recarga toda la aplicación.

### Verificación

- Añadido `npm run verify:pdfs` para revisar archivos, cada página interna, rangos HTTP y recarga directa de todas las rutas del visor.
- Validación completa: 21 documentos, 661 páginas y cero fallos.

## [Firebase 1.1.0] — 2026-07-19

### Publicación y búsqueda

- Cada PDF se valida página por página antes de publicarse y `pageCount` se calcula automáticamente.
- Los PDF sin texto buscable se rechazan con una instrucción para generar una versión con OCR.
- Título, descripción y categoría son obligatorios; se admiten etiquetas separadas por coma.
- Cada publicación crea un índice de búsqueda versionado en Firestore.
- La búsqueda general consulta metadatos y contenido del PDF.
- El visor reutiliza el índice persistente para la búsqueda interna.
- Añadido acceso a la búsqueda general en el encabezado y en la barra del visor.
- Eliminado el control de filtros sin comportamiento.

### Datos y validación

- Completadas descripciones y etiquetas de 20 catálogos históricos en Firestore y el respaldo local.
- Verificados 21 documentos, 661 páginas PDF, 661 páginas de búsqueda y consultas representativas.

## [Firebase 1.1.1] — 2026-07-19

### Visor de catálogos grandes

- Corregida la aparición de hojas blancas al avanzar: el visor prepara y valida el pliego de destino antes de cambiar de página.
- La navegación conserva un foco de renderizado independiente durante el cambio y mantiene la recuperación automática si una hoja compleja tarda más de lo esperado.
- Los PDF grandes usan una única transmisión HTTP fiable; el análisis y renderizado visual continúa limitado al pliego actual y a sus páginas vecinas.
- La caché gráfica queda limitada a seis páginas por documento para evitar pérdidas de lienzos por presión de memoria.
- Corregido el tamaño interno de `react-pageflip`, que estaba reduciendo los lienzos ya renderizados a cero píxeles de ancho.
- Las rutas públicas ya no quedan bloqueadas esperando la inicialización de Firebase Auth; la espera de autenticación se limita al administrador.
- Serializados los reintentos de PDF.js para impedir que dos tareas reutilicen simultáneamente el mismo lienzo.
- Verificado el archivo `CATALOGO TÉCNICO 2025`: 229 páginas válidas, incluida la portada, páginas intermedias y página final.
- Verificación visual en navegador: portada, avance 2–3 y apertura directa 50–51; precarga confirmada para páginas 48–54 y consola sin errores.

## [Firebase 1.1.2] — 2026-07-19

### Subidas administrativas

- Corregida la apertura de PDF recién publicados en Firestore: el visor ahora reconoce las URL `blob:` reconstruidas por el navegador.
- Cada nueva subida genera automáticamente una portada JPEG desde la primera página cuando el administrador no selecciona una imagen.
- La portada automática se respalda usando el mismo flujo de Google Drive que las imágenes seleccionadas manualmente.
- Reparado el documento de prueba `doc-mrshi3f0`: PDF, portada, respaldo e índice publicados.

### Verificación visual

- Confirmada la tarjeta pública con portada de 794 × 1123 píxeles.
- Confirmado el visor integrado con la página visible a 517 × 734 píxeles, indicador 1 / 1 y consola sin errores.

## [Firebase 1.1.3] — 2026-07-19

### Publicación administrativa e integridad

- El índice lateral del visor se genera y publica junto con cada PDF nuevo.
- La limpieza de datos antes de escribir en Firestore ahora elimina valores `undefined` también dentro de arreglos y objetos anidados.
- Se conserva `coverFileId` para sustituir o eliminar la portada automática sin dejar archivos huérfanos.
- La reparación desde Drive vuelve a crear la portada, el PDF interno, el índice lateral y el índice de búsqueda.
- Las rutas directas `/viewer/{id}` consultan primero el documento solicitado y ya no dependen de cargar toda la biblioteca.
- La reconstrucción Firestore comprueba cantidad y secuencia de fragmentos, tamaño total y firma `%PDF-`.

### Eliminación segura y privacidad

- Eliminado por completo el comprobante de prueba `doc-mrshi3f0`, incluidos metadatos, PDF, índice, respaldo y portada pública.
- Detectada y eliminada una segunda copia de prueba `doc-mrsjggcb` con el mismo contenido privado.
- El borrado administrativo procesa PDF y portada de Drive en secuencia y deja de ocultar fallos del puente.
- El puente Drive elimina definitivamente los respaldos verificados; enviarlos solamente a la papelera podía conservar accesibles sus enlaces públicos.

### Prueba integral en producción

- Publicado desde la interfaz un PDF comercial temporal de 8 páginas, sin datos personales.
- Verificados respaldo, portada JPEG de 165 230 bytes, 7 entradas de índice lateral y 8/8 páginas de búsqueda.
- La búsqueda general encontró título y contenido; el visor abrió la página solicitada como pliego 2–3, conservó ese estado después de recargar y no produjo solicitudes fallidas.
- Eliminada la prueba temporal desde el administrador y confirmada la desaparición de Firestore, PDF interno, índice, PDF Drive y portada Drive.
- Repetida la prueba del basurero administrativo: 2 fragmentos, versión, 8 páginas de búsqueda, PDF y portada quedaron eliminados; Firestore y el PDF Drive respondieron 404.

## [Firebase 1.1.4] — 2026-07-19

### Enlace del banner promocional

- Los dominios escritos como `www.chaide.com/` o `chaide.com` se normalizan automáticamente a `https://www.chaide.com/`.
- El administrador guarda siempre el destino externo normalizado y continúa permitiendo rutas internas que comiencen con `/`.
- Los enlaces con protocolos ejecutables o no admitidos se descartan antes de renderizar el banner.
- Actualizado el enlace vigente de Firestore y desplegada la corrección en Firebase Hosting.
- Verificados los banners web y móvil: ambos apuntan directamente a `https://www.chaide.com/`, usan una pestaña nueva y no incluyen el dominio de la biblioteca.

## [Firebase 1.1.5] — 2026-07-19

### Identidad visual del navegador

- Añadido el símbolo oficial entregado por el usuario como favicon de la pestaña.
- Eliminado el fondo blanco exterior: solo el círculo azul y la media luna permanecen visibles; las esquinas son transparentes.
- Generados formatos ICO y PNG en 16, 32, 180, 192 y 512 píxeles, sin alterar el visor ni los componentes funcionales.
- Añadido `site.webmanifest` para accesos directos y dispositivos móviles.
- Verificada la compilación y las respuestas públicas: ICO y PNG devuelven HTTP 200 con sus tipos de imagen correctos.

## [Firebase 1.2.0] — 2026-07-21

### Seguridad y publicación

- Las nuevas cargas se guardan como borradores privados por defecto; publicar inmediatamente requiere una selección explícita.
- Las reglas de Firestore impiden leer PDF e índices de borradores sin una sesión administrativa válida.
- Se añadió un registro inmutable de operaciones administrativas para creación, edición y eliminación.
- Se añadieron cabeceras de seguridad y se corrigió la política de caché de `site.webmanifest`.
- Actualizadas las dependencias hasta obtener cero vulnerabilidades en `npm audit`.

### Visor, búsqueda e integridad

- Cada PDF nuevo guarda y verifica su firma SHA-256, además de tamaño, firma PDF, cantidad y secuencia de fragmentos.
- El visor reintenta Firestore y utiliza automáticamente el respaldo público de Drive cuando el almacenamiento principal falla.
- Los PDF reconstruidos quedan en una caché IndexedDB limitada a dos catálogos para acelerar recargas sin agotar el dispositivo.
- Los índices dinámicos se consultan por versión, se guardan localmente y se descargan con concurrencia limitada.
- Los PDFs escaneados sin texto ya pueden publicarse y visualizarse; quedan marcados como `no-text` hasta aplicar OCR.
- Se filtran títulos de índice con caracteres de control o contenido inválido.

### Respaldo y operación

- Añadido `npm run backup:firestore`; el respaldo privado incluye documentos, categorías, configuración, manifiestos e índices, mientras los bytes PDF permanecen en Drive. La auditoría no se exporta.
- Añadida verificación continua para compilación, biblioteca e implementación de Firebase Hosting.
- Excluidas las sesiones temporales del navegador y los respaldos privados del repositorio.
- Las portadas, banners e imágenes de categorías reemplazadas eliminan sus archivos anteriores de Drive.

### Verificación

- Reglas Firestore compiladas y desplegadas; comprobado que un PDF público funciona y el mismo PDF en borrador responde con acceso denegado.
- Verificados 21 catálogos, 661 páginas y 661 páginas de búsqueda sin fallos.
- Verificación visual: el catálogo técnico de 229 páginas cargó cinco lienzos vecinos, avanzó, sobrevivió una recarga y mantuvo el visor operativo.
- Verificados el buscador global, el enlace externo del banner y el panel administrativo con el nuevo control de borrador.

## [Firebase 1.2.1] — 2026-07-21

### Despliegue y protección de borradores

- Corregida la compilación automática de GitHub: el workflow define explícitamente el modo Firebase y la configuración pública del puente Drive.
- Añadido un respaldo por dominio en tiempo de ejecución para impedir que Firebase Hosting vuelva a ejecutar por error el modo servidor y consulte rutas `/api/*` inexistentes.
- GitHub Actions autentica y despliega también las reglas de Firestore; la cuenta técnica conserva únicamente Hosting, reglas y consumo de servicios.
- Las fichas de documentos privados ya no pueden leerse anónimamente; las consultas públicas exigen `ready`, `isActive=true` y `visibility=public`.
- Normalizados 20 documentos históricos de `Público` a `public` mediante `npm run migrate:publication-fields`.

### Administración y búsqueda

- El panel distingue claramente `Borrador privado` de `Publicado`.
- La edición incluye un selector de visibilidad; publicar activa el documento y volverlo privado lo retira de biblioteca y buscador.
- Una consulta administrativa que coincide con una carga pública en curso ya no se descarta.
- La página de búsqueda refresca el catálogo al abrirse en Firebase y ofrece un botón visible `Buscar`, además de admitir Enter.

### Prueba integral real

- Subido desde el administrador un PDF temporal de 3 páginas como borrador privado; se verificaron portada automática, respaldo Drive, SHA-256, fragmento Firestore y tres páginas de índice.
- Confirmado que el borrador y su PDF interno respondían 403 sin autenticación; después se publicó desde el selector de visibilidad.
- El visor cargó el lienzo actual, avanzó al pliego 2–3, se recuperó automáticamente tras recargar y encontró `PDFObject` en la búsqueda interna.
- La búsqueda global devolvió tres coincidencias del índice persistente sin descargar todos los PDF.
- El basurero administrativo eliminó la ficha, manifiestos, fragmentos, versión, páginas de búsqueda, PDF y portada de Drive; la biblioteca volvió a 21 catálogos.

## [Firebase 1.2.2] — 2026-07-21

### Sesión, categorías y mantenimiento

- El cierre de sesión invalida cargas en curso y vacía inmediatamente documentos administrativos en memoria antes de consultar nuevamente la biblioteca pública.
- El administrador recibe también categorías desactivadas, por lo que puede volver a activarlas; el público continúa viendo solo categorías activas.
- La eliminación oculta primero el catálogo, limpia Firestore en grupos y registra una tarea persistente cuando Drive requiere reintento.
- El panel ejecuta mantenimiento al entrar y al refrescar: reintenta eliminaciones de Drive, completa limpiezas pendientes y elimina manifiestos huérfanos.
- Eliminados tres manifiestos vacíos de búsqueda pertenecientes a pruebas antiguas.

### Rendimiento y respaldo privado

- La subida reutiliza un único análisis de cada página para texto e índice, evitando la extracción duplicada. Por decisión operativa, el OCR de PDFs escaneados permanece desactivado.
- Los respaldos Firestore sin cifrar se guardan exclusivamente en `backups/private/` y ya no se versionan en el repositorio público.
- Añadido un respaldo diario cifrado mediante GitHub Actions, con artefactos de recuperación durante 30 días.
- La clave de cifrado se conserva como secreto de GitHub y en el archivo local ignorado `backups/private/firestore-backup-encryption.key`.
- Verificado un ciclo completo exportar → cifrar → descifrar con igualdad SHA-256.
