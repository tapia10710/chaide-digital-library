# Puente gratuito de Google Drive

Guarda PDFs, portadas, banners e iconos en una carpeta central de Google Drive.
La PWA envía el token Firebase del administrador; el script valida el correo
antes de aceptar cualquier operación.

Carpeta de producción:

`https://drive.google.com/drive/folders/1EydsTjzkLvA2fhfermVYlkLM6JXSG6yq`

## Propiedades del script

- `FIREBASE_API_KEY`: clave web del proyecto Firebase.
- `DRIVE_FOLDER_ID`: opcional. Si falta, crea `Chaide Biblioteca Digital`.

El despliegue debe ser Web app, ejecutarse como el propietario y permitir
acceso a cualquiera. El permiso público solo permite invocar el endpoint; cada
operación sigue requiriendo un token Firebase válido del administrador.
