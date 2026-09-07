# 05 — Registro de cambios

## 2026-08-31 · Estructura final de categorías

- Se retiraron de los menús las entradas genéricas “Catálogos” y “Generales” en web, tablet y móvil.
- La navegación quedó ordenada como “Catálogo de Productos”, “Catálogo de Distribuidores” y “Fichas de productos e innovaciones”.
- Los 149 documentos publicados se asignaron inicialmente a “Fichas de productos e innovaciones” para reclasificarlos después desde Administración.
- Los documentos nuevos seleccionan automáticamente “Fichas de productos e innovaciones” como categoría inicial.
- Productos y Distribuidores pueden eliminarse; antes de hacerlo, sus documentos se trasladan a Fichas para que ninguno quede sin categoría.
- “Fichas de productos e innovaciones” permanece protegida como destino seguro y “Generales” fue retirada definitivamente.
- Las categorías eliminadas no reaparecen en las páginas públicas y el catálogo general usa únicamente categorías existentes.
- Se verificaron en producción la portada, las tres rutas de categoría y el panel administrativo en computadora, tablet y móvil.
- Los accesos con iconos ahora usan nombres de dos líneas, tamaños uniformes y tres columnas exactas; se eliminó el espacio vacío que aparecía en celular.

## 2026-08-28 · Portada simplificada

- Se retiró únicamente la sección “Catálogos sugeridos” de la pantalla principal en web, tablet y móvil.
- Se conservaron el catálogo destacado, el banner promocional, la navegación, las categorías, el buscador y el acceso al catálogo completo.
- La versión publicada se verificó sin desbordamientos horizontales ni errores del navegador en los tres tamaños de pantalla.

## 2026-08-07 · Ciclo administrativo verificado y página persistente

- Se ejecutó en producción una prueba reversible de catálogo nuevo, búsqueda global, búsqueda interna, visor móvil, reemplazo y eliminación.
- Se verificó por separado el recorrido Drive pendiente → detección → publicación → búsqueda → visor → eliminación definitiva en Drive.
- El reemplazo retiró del índice el texto de la versión anterior y publicó únicamente el contenido de la nueva versión.
- La eliminación retiró el catálogo temporal de Administración, búsqueda, visor, fragmentos e índice global.
- El visor ahora conserva en la dirección la página que el usuario está viendo; al recargar o compartir el enlace ya no vuelve inesperadamente a la página inicial.
- La tabla administrativa muestra 25 catálogos por página para evitar mantener cientos de filas y acciones ocultas detrás del panel de sincronización.
- La integridad final quedó en 149 catálogos publicados, 149 catálogos indexados y 866 páginas buscables.

## 2026-08-07 · Primera búsqueda acelerada

- La búsqueda de Firebase dejó de descargar el índice individual de todos los catálogos en cada navegador nuevo.
- Se creó un índice global por palabras que consulta directamente las páginas candidatas y conserva el enlace exacto al catálogo y página.
- La subida, el reemplazo, la publicación como borrador, la activación y la eliminación mantienen automáticamente el índice global.
- Se migraron 149 catálogos y 866 páginas buscables sin retirar los índices históricos del sitio.
- Se reconstruyó el índice faltante de FICHA TÉCNICA ORTOPÉDICO PRENSADO PILLOW TOP desde su respaldo de Drive.
- La consulta pública de control respondió en aproximadamente un segundo sin recorrer los 149 catálogos.
- Las páginas nuevas permanecen privadas hasta que la publicación del catálogo termina; los borradores no pueden filtrarse durante una subida.
- Un fallo posterior al guardado ya no revierte una versión que el catálogo público empezó a utilizar; queda un reintento persistente y seguro.
- Las búsquedas consecutivas se aíslan para impedir que una respuesta antigua sobrescriba la consulta más reciente.
- Los controles inferiores del buscador ahora paginan realmente los resultados en grupos de 20 y evitan renderizar cientos de tarjetas simultáneamente.
- La reconstrucción global marca el índice como no disponible hasta completarse y utiliza los índices individuales como respaldo durante ese intervalo.
- Las limpiezas grandes se ejecutan en grupos controlados para evitar saturar Firestore.
- Se actualizaron dependencias transitivas y la auditoría quedó sin vulnerabilidades conocidas.

## 2026-08-07 · Biblioteca de Drive sincronizada por completo

- Se procesaron los 21 PDFs que estaban pendientes en la carpeta conectada de Google Drive, incluidos cuatro archivos de entre 63 y 136 MB.
- Los catálogos nuevos y los reemplazos conservan su relación con el archivo actual y con las fuentes históricas de Drive, evitando que vuelvan a aparecer como pendientes.
- La clasificación sugerida reconoce mejor muebles, colchones y complementos antes de publicar.
- El panel dejó de crear cientos de opciones invisibles para cada PDF nuevo, reduciendo el consumo de memoria y los bloqueos al trabajar por lotes.
- La biblioteca evita duplicados visuales cuando coinciden la actualización de Firestore y la publicación optimista.
- Si Drive no permite borrar un archivo ajeno, el sistema intenta enviarlo a la papelera y comunica claramente la falta de permisos.
- Se verificó que el panel quedó sin PDFs pendientes, que el buscador indexó la biblioteca y que el PDF grande VELADOR FERRARA coincide exactamente con su respaldo y renderiza sus cuatro páginas.

## 2026-08-03 · Pruebas y recuperación administrativa reforzadas

- Se verificó una carga transaccional completa con respaldo, checksum, PDF del visor, índice, búsqueda, descarga y limpieza temporal.
- Los respaldos y portadas anteriores de un reemplazo ahora generan una tarea persistente antes de intentar eliminarlos de Drive.
- Si Drive falla durante esa limpieza, el mantenimiento administrativo vuelve a intentarlo automáticamente sin afectar la versión nueva.
- Un fallo al refrescar la tabla después de publicar ya no presenta la publicación exitosa como fallida.
- El administrador muestra un estado explícito mientras sincroniza la biblioteca y distingue una biblioteca vacía de una búsqueda sin resultados.
- La clasificación automática reconoce los catálogos de toallas como Complementos.

## 2026-08-03 · Robustez adicional para archivos grandes

- Las sesiones firmadas de transferencia duran hasta dos horas, permaneciendo ligadas a una sola operación y tamaño exacto.
- La subida detecta sesiones que dejan de avanzar y evita quedar atrapada en un ciclo infinito.
- Los errores temporales de Drive se reintentan; errores de permisos, validación o sesión se informan inmediatamente.
- Las descargas de respaldo validan la firma `%PDF-` y la recuperación pública tiene un tiempo máximo de espera.
- El buscador general corrige errores ortográficos con el vocabulario local y admite palabras separadas en distinto orden.
- La búsqueda del visor reconoce variantes singular/plural y usa el índice validado cuando un PDF no tiene una capa de texto completa.
- Los enlaces profundos de búsqueda vuelven a comprobar el resultado cuando termina de cargar el índice, evitando falsos mensajes de “No hay resultados”.
- Se actualizaron dependencias transitivas compatibles para corregir alertas de seguridad sin introducir cambios incompatibles.

## 2026-08-03 · Sincronización de Drive reforzada

- El inventario de PDFs dejó de exponerse por una consulta pública y ahora requiere la sesión administrativa de Firebase.
- La detección de repetidos ignora fechas, versiones y sufijos como `compressed`, y distingue entre copia idéntica y posible reemplazo.
- Drive devuelve la huella MD5 y las nuevas publicaciones la conservan para identificar copias exactas aunque cambie el nombre o el ID.
- Las decisiones del panel se conservan localmente al cerrarlo o recargarlo y se eliminan al completar o borrar el archivo.
- Un mismo catálogo no puede ser reemplazado por dos PDFs dentro del mismo lote.
- El inventario deja de truncarse a 250 PDFs y el caché no bloquea inventarios que superen su capacidad.

> **Aviso de actualización manual:** añadir una entrada en este archivo antes de integrar cada versión. El historial de Git sigue siendo el detalle técnico; este documento resume cambios operativos y funcionales. Última revisión manual: **3 de agosto de 2026**.

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
- Inicio y cierre de sesión son idempotentes: una notificación duplicada de Firebase ya no cancela la recarga pública ni deja la portada vacía.
- El administrador recibe también categorías desactivadas, por lo que puede volver a activarlas; el público continúa viendo solo categorías activas.
- Los selectores de subida y las rutas públicas excluyen categorías desactivadas, y muestran un estado de carga en lugar de mensajes vacíos mientras Firebase responde.
- La eliminación oculta primero el catálogo, limpia Firestore en grupos y registra una tarea persistente cuando Drive requiere reintento.
- El panel ejecuta mantenimiento al entrar y al refrescar: reintenta eliminaciones de Drive, completa limpiezas pendientes y elimina manifiestos huérfanos.
- Eliminados tres manifiestos vacíos de búsqueda pertenecientes a pruebas antiguas.

### Rendimiento y respaldo privado

- La subida reutiliza un único análisis de cada página para texto e índice, evitando la extracción duplicada. Por decisión operativa, el OCR de PDFs escaneados permanece desactivado.
- Los respaldos Firestore sin cifrar se guardan exclusivamente en `backups/private/` y ya no se versionan en el repositorio público.
- Añadido un respaldo diario cifrado mediante GitHub Actions, con artefactos de recuperación durante 30 días.
- La clave de cifrado se conserva como secreto de GitHub y en el archivo local ignorado `backups/private/firestore-backup-encryption.key`.
- Verificado un ciclo completo exportar → cifrar → descifrar con igualdad SHA-256.
- Los respaldos cifrados incluyen las tareas de mantenimiento pendientes para no perder reintentos de limpieza durante una restauración.

## [Firebase 1.2.3] — 2026-07-21

### Rendimiento del visor

- El catálogo Edredones Zafiro fue aplanado a una sola imagen optimizada por página para conservar su apariencia y evitar decodificar más de 230 capas y máscaras en cada apertura.
- El visor pinta primero únicamente la portada o el pliego visible; las páginas cercanas se preparan después en tiempo inactivo, sin competir con la página que espera el usuario.
- PDF.js reduce imágenes internas sobredimensionadas antes de transferirlas al lienzo y ya no cancela una página pesada por superar un temporizador fijo de 1,5 segundos.
- El PDF web de Zafiro bajó de 21,2 MB a 3,65 MB; el original permanece respaldado en Drive.

### Seguridad de dependencias

- Se actualizó `fast-uri` para corregir la vulnerabilidad de severidad alta detectada por `npm audit`; quedan únicamente avisos moderados de una herramienta de desarrollo que no forma parte del servidor público.

## [Firebase 1.2.4] — 2026-07-21

### Asistente de catálogos

- Añadido un botón flotante en todas las pantallas públicas con panel adaptable a escritorio y celular.
- El asistente consulta únicamente los 661 índices de página persistidos; no usa servicios externos ni responde con conocimiento ajeno a los PDF.
- Cada respuesta muestra hasta cuatro fuentes, limita coincidencias débiles y abre el visor en el catálogo y página exactos con una búsqueda válida.
- Los catálogos históricos leen primero sus índices JSON de Hosting para evitar cientos de lecturas Firestore por conversación; las cargas nuevas continúan usando su índice dinámico versionado.
- Probada la consulta “edredón Zafiro”: devolvió exclusivamente las páginas 8 y 9 del catálogo correcto y el enlace abrió el pliego 8–9 con resultados internos.

### Prevención de PDF pesados

- La validación administrativa cuenta operaciones de imagen y máscaras en cada página.
- Los archivos grandes y con capas excesivas generan automáticamente una copia web aplanada a 180 DPI aproximados, mientras Drive conserva el original.
- El índice, la portada y el texto se obtienen antes de optimizar, por lo que buscador, índice lateral y asistente siguen funcionando.
- El documento registra modo, tamaños y métricas de complejidad en `viewerOptimization` para auditoría futura.
# Versión 2026-07-21 — Asistente IA con fuentes verificadas

- Se añadió un Worker gratuito de Cloudflare Workers AI para redactar respuestas en español.
- El modelo recibe únicamente los fragmentos recuperados desde los índices por página.
- Se validan en servidor y navegador el catálogo y la página de cada cita antes de mostrar la respuesta.
- Cada fuente abre el visor integrado directamente en la página correspondiente.
- Si la IA falla o agota su cuota gratuita, el buscador local responde automáticamente y el visor continúa funcionando.
- Las altas, reemplazos y eliminaciones de PDFs se reflejan sin reentrenar el modelo porque el asistente consulta siempre el índice vigente.

## [Firebase 1.2.5] — 2026-07-21

### Sincronización y vigencia del conocimiento

- La biblioteca mantiene una suscripción en tiempo real a Firestore: un PDF publicado, reemplazado, retirado o eliminado actualiza también las pestañas que ya estaban abiertas.
- Cada consulta vuelve a comprobar los documentos antes y después de recuperar resultados; si una versión cambia durante la búsqueda, esta se repite una vez contra el índice nuevo.
- Las fuentes y la caché quedan ligadas a `searchIndexVersion`; una página de una versión anterior no puede convertirse en respuesta ni cita de la versión actual.
- Al pulsar una fuente se valida otra vez que el catálogo, la versión y la página sigan vigentes antes de abrir el visor.
- El Worker rechaza citas que no correspondan exactamente a la evidencia y también cifras que no aparezcan en las páginas citadas.

### Interfaz y recuperación

- El panel indica si el conocimiento está sincronizado, sincronizándose o si cada consulta deberá verificarse directamente.
- Los errores no conservan como válida una respuesta potencialmente antigua: permiten reintentar la pregunta con el índice actual.
- Añadidos controles para limpiar la conversación, estados de carga por fuente, límites de entrada y soporte de movimiento reducido.
- La verificación automatizada cubre versiones antiguas, documentos borrados o privados, estados de procesamiento y páginas fuera de rango.

## [Firebase 1.2.6] — 2026-07-22

### Comprensión de errores de escritura sin costo

- El asistente construye localmente un vocabulario ponderado desde títulos, etiquetas y texto de los índices publicados.
- Se corrigen letras omitidas, sustituidas o intercambiadas, incluyendo consultas como `edrdon safiro`, sin enviar el catálogo a otro servicio.
- Una corrección solo se aplica con suficiente similitud y una alternativa claramente superior; los casos ambiguos permanecen sin modificar para evitar respuestas equivocadas.
- La interfaz informa exactamente qué palabras interpretó de otra forma y mantiene las fuentes por catálogo, versión y página.

### Mayor duración de la cuota gratuita

- La redacción usa la variante rápida Llama 3.1 8B, con un consumo aproximado seis veces menor que la variante 70B utilizada anteriormente.
- Las respuestas verificadas se reutilizan durante la sesión cuando coinciden pregunta y versiones de las fuentes.
- Al alcanzar el límite por minuto o la cuota diaria, se activa una pausa temporal y continúa el resultado local determinista.
- No se añadieron servicios, almacenamiento, planes ni recursos de pago.

## [Firebase 1.2.7] — 2026-07-22

### Navegación exacta desde búsqueda y asistente

- Los resultados con evidencia dentro del PDF aparecen antes que las coincidencias generales del título o descripción.
- Si un catálogo tiene páginas coincidentes, se oculta su resultado genérico de página 1 para evitar que el usuario abra solo la portada.
- Todos los enlaces del buscador y el asistente comparten un constructor validado con catálogo, página exacta y término de búsqueda.
- El visor vuelve a procesar el destino cuando cambian `page` o `search`, incluso si el usuario ya está dentro del mismo PDF.
- Los resultados son botones accesibles y ahora indican explícitamente `Abrir página N`.

### Continuidad del chatbot

- Las preguntas breves de seguimiento reutilizan únicamente el nombre del producto de la consulta anterior.
- Los seguimientos quedan restringidos al catálogo citado primero, evitando mezclar medidas o características de otro catálogo.
- Una pregunta nueva que contiene otro producto no hereda el contexto previo.
- La interfaz avisa cuando una respuesta continuó desde la pregunta anterior y limpiar la conversación elimina también ese contexto.
- La redacción recibe instrucciones para no mezclar productos y para incluir todos los elementos explícitos cuando responde una lista.

## [Firebase 1.2.8] — 2026-07-30

### Identidad visual y navegación del visor

- Las áreas editoriales señaladas usan los azules corporativos `#0055b8` y `#0d3281`.
- El visor incorpora en la barra superior flechas de página anterior y siguiente, además de un campo editable `página / total` para saltar directamente.
- El control de página se adapta a escritorio, tablet y celular sin cambiar la carga prioritaria ni la recuperación automática del PDF.

### Reemplazo administrativo visible y seguro

- El panel de PDF permite elegir explícitamente entre `Subir PDF nuevo` y `Reemplazar PDF existente`.
- El modo de reemplazo muestra una lista ordenada de catálogos y una vista previa del documento seleccionado.
- El reemplazo conserva el identificador del catálogo y actualiza PDF, portada, cantidad de páginas, respaldo e índice de búsqueda con versiones nuevas.
- Los archivos anteriores se eliminan solo después de publicar correctamente la nueva versión; si no existe una portada nueva válida, se conserva la anterior.

## [Firebase 1.2.9] — 2026-08-03

### Sincronización administrativa con Google Drive

- El administrador incorpora un panel modal para detectar PDFs colocados manualmente en la carpeta raíz o en la subcarpeta `catalogs` de Drive.
- El panel permite seleccionar uno, varios o todos los PDFs pendientes y procesarlos secuencialmente con un único botón, evitando sobrecargar el navegador.
- Los metadatos se completan automáticamente desde el nombre del archivo y la categoría se sugiere por contenido; los archivos ya vinculados quedan fuera de la selección.
- Los archivos repetidos permanecen visibles con una etiqueta clara y cada fila conserva su propia decisión: categoría, crear un catálogo nuevo o reemplazar uno existente.
- El panel de decisiones oculta por completo los PDFs que ya están vinculados y muestra únicamente archivos nuevos o repetidos todavía accionables.
- La eliminación comprueba el inventario después de borrar y solo informa éxito cuando el PDF ya no existe en la carpeta compartida.
- El puente dejó de depender de `DriveApp` en ejecuciones públicas y usa la API REST de Drive para inventario, transferencia, permisos y borrado definitivo.
- Solo se muestran como pendientes los archivos cuyo identificador de Drive todavía no está vinculado a un catálogo de la biblioteca.
- Cada PDF pendiente puede procesarse para la web completando título, categoría, descripción, etiquetas y estado de publicación.
- La importación reutiliza el archivo existente en Drive y genera únicamente la portada, el PDF optimizado del visor y el índice de búsqueda que faltan.
- La eliminación desde el panel requiere una segunda confirmación y borra definitivamente solo archivos pendientes administrados por la carpeta configurada.

### Rendimiento de publicación

- Se retiró el límite artificial de 35 MB para PDFs; las subidas y recuperaciones grandes continúan por bloques y solo quedan sujetas a las cuotas técnicas de los servicios utilizados.
- La prueba integral de publicación ahora recupera respuestas HTML/404 transitorias del puente de Drive y reintenta con espera progresiva, igual que la aplicación.
- Las solicitudes a Drive tienen cancelación por tiempo máximo: una respuesta atascada ya no bloquea indefinidamente la subida, descarga, sincronización ni eliminación.
- La subida muestra por separado el avance del procesamiento del visor y del respaldo en Drive, para distinguir una operación larga de un bloqueo.
- Si falla una escritura por bloques, se eliminan automáticamente los fragmentos parciales del PDF y de su índice antes de permitir un nuevo intento.
- Durante una publicación, reemplazo, importación o eliminación activa, el navegador advierte antes de cerrar o recargar accidentalmente la pestaña.
- Cada subida a Drive lleva una clave única y puede consultar el estado de su sesión reanudable; si se pierde la respuesta de un bloque o del cierre, continúa desde el byte confirmado sin duplicar el PDF.
- La verificación operativa completó una subida temporal real de 40 MB en diez bloques, comprobó tamaño y firma PDF desde Drive y eliminó el archivo de prueba sin residuos.
- Las transferencias grandes usan sesiones HMAC temporales emitidas después de autenticar al administrador; los bloques ya no repiten una consulta externa de Firebase y conservan autorización limitada por operación, archivo, tamaño y vencimiento.
- Las pruebas comparativas descartaron bloques de 8 MB porque aumentaban el riesgo de agotar el tiempo de Apps Script; la subida conserva bloques reanudables de 4 MB y las descargas de 2 MB reutilizan la sesión firmada.
- La validación local y el respaldo del PDF en Drive se ejecutan en paralelo durante una subida normal.
- El PDF del visor y sus páginas de índice se guardan en paralelo después de la validación.
- Las escrituras de fragmentos en Firestore aumentan su concurrencia controlada de cuatro a ocho.
- Las descargas desde Drive procesan hasta cuatro bloques simultáneamente y muestran progreso.
- Los bloques de la subida reanudable a Drive aumentan de 1.5 MB a 4 MB para reducir solicitudes al puente.
- Las respuestas transitorias 404, 408, 429 y 5xx del puente se reintentan automáticamente antes de mostrar un error.
- El inventario de PDFs de Drive usa una caché breve de 60 segundos: las revisiones consecutivas tardan pocos segundos sin ocultar por mucho tiempo archivos agregados manualmente.
- La aplicación recupera automáticamente una pestaña abierta durante un despliegue si esta intenta cargar un módulo antiguo; las rutas internas ahora entregan siempre el HTML sin caché.
- Se eliminaron 67 versiones históricas de Hosting y el canal público conserva automáticamente solo tres versiones para evitar volver a superar la cuota gratuita.
