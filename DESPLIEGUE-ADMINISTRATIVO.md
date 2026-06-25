# Plan de implementacion web con administracion

Esta modalidad publica el frontend y el backend juntos. Permite iniciar sesion
en `/admin`, subir PDF, cambiar portadas, administrar categorias y conservar
los cambios despues de reinicios o nuevas versiones.

## Opcion temporal: Railway

1. Subir esta carpeta a un repositorio de GitHub.
2. En Railway, seleccionar `New Project > Deploy from GitHub repo`.
3. Elegir el repositorio.
4. Abrir el servicio y agregar un volumen.
5. Conectar el volumen al servicio con mount path `/data`.
6. En `Variables`, crear:

```text
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=UNA_CLAVE_NUEVA_Y_SEGURA
ADMIN_TOKEN=UN_TOKEN_LARGO_Y_ALEATORIO
COOKIE_SECURE=true
```

No es necesario definir `PORT`. Tampoco es necesario definir `DATA_DIR`:
Railway entrega automaticamente la ruta del volumen mediante
`RAILWAY_VOLUME_MOUNT_PATH`.

7. En `Settings > Networking`, seleccionar `Generate Domain`.
8. Abrir:

```text
https://DOMINIO/api/health
https://DOMINIO/
https://DOMINIO/admin
```

El archivo `railway.json` obliga a Railway a usar el `Dockerfile`, verifica
`/api/health` y reinicia el servicio si se detiene.

## Comprobacion obligatoria

1. Iniciar sesion en `/admin`.
2. Subir un PDF de prueba.
3. Confirmar que aparece en la biblioteca.
4. Reiniciar o volver a desplegar el servicio.
5. Confirmar que el PDF continua disponible.

Si desaparece, el volumen no está conectado a `/data`.

## Servidor propio con Docker

```powershell
Copy-Item .env.docker.example .env
docker compose up -d --build
```

Abrir `http://IP-DEL-SERVIDOR:8080/admin`. El volumen `chaide-data` conserva
los archivos y la configuracion.

## Diferencia con GitHub Pages

GitHub Pages es una copia pública de solo lectura. El panel administrativo y la
subida de archivos funcionan únicamente al ejecutar el backend en Railway,
Docker, Google Cloud, un VPS o un servidor interno.
