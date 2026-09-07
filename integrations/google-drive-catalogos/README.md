# Puente gratuito de Google Drive

Guarda PDFs, portadas, banners e iconos en una carpeta central de Google Drive.
La PWA envía el token Firebase del administrador; el script valida el correo
antes de aceptar cualquier operación.

Carpeta de producción:

`https://drive.google.com/drive/folders/1EydsTjzkLvA2fhfermVYlkLM6JXSG6yq`

Los PDFs añadidos manualmente en esa carpeta raíz o dentro de `catalogs` se
detectan desde **Administrador → Sincronizar Drive**. El administrador completa
los metadatos y la aplicación genera la portada, el índice y la copia del visor
sin volver a subir el original.

El panel mantiene visibles los archivos repetidos y permite decidir por cada PDF
si crea un catálogo nuevo o reemplaza uno existente, además de elegir su categoría.
La eliminación se verifica contra Drive antes de retirar el archivo de la lista.

## Propiedades del script

- `FIREBASE_API_KEY`: clave web del proyecto Firebase.
- `DRIVE_FOLDER_ID`: opcional. Si falta, crea `Chaide Biblioteca Digital`.

El despliegue debe ser Web app, ejecutarse como el propietario y permitir
acceso a cualquiera. El permiso público solo permite invocar el endpoint; cada
operación sigue requiriendo un token Firebase válido del administrador.
