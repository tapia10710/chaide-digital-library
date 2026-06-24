# Chaide Biblioteca Digital

Biblioteca web de catalogos construida con React, Vite, TypeScript y Express.
El proyecto puede publicarse en cualquier repositorio de GitHub o instalarse
con Docker en un servidor.

## Contenido

- Sitio publico con catalogos, categorias, busqueda y visor PDF.
- Panel de administracion para subir, editar y eliminar contenido.
- Despliegue estatico automatico en GitHub Pages.
- Despliegue completo con backend mediante Docker o Railway.
- Catalogos, portadas y configuracion inicial incluidos en `data/`.

## Requisitos

- Node.js 22 o superior.
- Git.
- Docker, solo si se usara el despliegue completo en un servidor.

## Desarrollo local

```bash
npm ci
npm run dev
```

La aplicacion queda disponible en `http://localhost:3000`.

## Verificacion

```bash
npm run lint
npm run build
npm run build:pages
```

## Publicar en otro GitHub

El proyecto no depende del nombre ni de la cuenta del repositorio. El flujo de
GitHub Pages calcula automaticamente la ruta correcta.

1. Crear un repositorio vacio en la cuenta de destino.
2. Si esta carpeta ya tiene Git, cambiar el remoto:

```bash
git remote set-url origin https://github.com/USUARIO/NUEVO-REPOSITORIO.git
git push -u origin main
```

Si es una copia limpia sin la carpeta `.git`, ejecutar:

```bash
git init -b main
git add .
git commit -m "Publicar Chaide Biblioteca Digital"
git remote add origin https://github.com/USUARIO/NUEVO-REPOSITORIO.git
git push -u origin main
```

3. En GitHub, abrir `Settings > Pages`.
4. En `Build and deployment`, seleccionar `GitHub Actions`.
5. Esperar a que finalice `Deploy GitHub Pages` en la pestana `Actions`.

No se deben subir `.env`, `node_modules`, `dist`, registros ni paquetes ZIP.
Los archivos PDF individuales incluidos no superan el limite de 100 MB de
GitHub.

## Despliegue completo

GitHub Pages es una version publica de solo lectura. Para habilitar el panel de
administracion y la subida de archivos se necesita ejecutar el backend:

```powershell
Copy-Item .env.docker.example .env
docker compose up -d --build
```

Antes de arrancar, editar `.env` y definir credenciales nuevas. Los datos deben
guardarse en un volumen persistente. Nunca se debe subir el archivo `.env`.

Para Railway, el repositorio incluye `railway.json`, un `Dockerfile` y la
plantilla `.env.railway.example`. Los pasos completos estan en
[`DESPLIEGUE-ADMINISTRATIVO.md`](DESPLIEGUE-ADMINISTRATIVO.md).
