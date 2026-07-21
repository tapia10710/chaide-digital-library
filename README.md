# Chaide Biblioteca Digital

## Producción Firebase

La biblioteca está publicada en **https://biblioteca-catalogos-chaide.web.app**.

El despliegue principal utiliza Firebase Hosting, Cloud Firestore, Firebase Authentication y Google Drive como respaldo. Los 21 PDF históricos y todos los PDF nuevos se abren con el visor PDF.js integrado.

```powershell
npm run lint
npm run build:firebase
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting --project biblioteca-catalogos-chaide
```

La modalidad Docker se mantiene como alternativa de autohospedaje y reversión.

Biblioteca web de catalogos construida con React, Vite, TypeScript y Express.
El proyecto puede publicarse en cualquier repositorio de GitHub o instalarse
con Docker en un servidor.

## Contenido

- Sitio publico con catalogos, categorias, busqueda y visor PDF.
- Panel de administracion para subir, editar y eliminar contenido.
- Build estatico de solo lectura disponible mediante `npm run build:pages`.
- Despliegue completo con backend mediante Docker, Railway o servidor propio.
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

## Publicar el código en otro GitHub

El repositorio puede alojarse en cualquier cuenta de GitHub.

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

No se deben subir `.env`, `node_modules`, `dist`, registros ni paquetes ZIP.
Los archivos PDF individuales incluidos no superan el limite de 100 MB de
GitHub.

## Despliegue completo

Para habilitar el panel de administracion, Google Drive y la subida de archivos
se necesita ejecutar el backend:

```powershell
Copy-Item .env.docker.example .env
docker compose up -d --build
```

Antes de arrancar, editar `.env` y definir credenciales nuevas. Los datos deben
guardarse en un volumen persistente. Nunca se debe subir el archivo `.env`.

Para Railway, el repositorio incluye `railway.json`, un `Dockerfile` y la
plantilla `.env.railway.example`. Los pasos completos estan en
[`DESPLIEGUE-ADMINISTRATIVO.md`](DESPLIEGUE-ADMINISTRATIVO.md).

La rama `main` contiene un workflow para construir y publicar la imagen Docker.
El servidor utiliza Watchtower para detectar la nueva etiqueta `latest` y
actualizar el contenedor. Este repositorio no contiene actualmente un workflow
de GitHub Pages. El build estatico sigue disponible, pero su publicación
requiere configurar un workflow o proveedor por separado.

Para habilitar operaciones administrativas en un despliegue con backend,
configure `ADMIN_TOKEN` exclusivamente como variable de entorno del servidor.

## Documentación del proyecto

> **Aviso:** esta documentación se actualiza manualmente; cualquier cambio funcional,
> técnico o de despliegue debe reflejarse también en el registro de cambios.

- [00 — Contexto maestro](00_CONTEXTO_MAESTRO.md)
- [01 — Plan de trabajo](01_PLAN_DE_TRABAJO.md)
- [02 — Mapa funcional](02_MAPA_FUNCIONAL.md)
- [03 — Modelo de datos](03_MODELO_DE_DATOS.md)
- [04 — Roles y permisos](04_ROLES_Y_PERMISOS.md)
- [05 — Registro de cambios](05_REGISTRO_DE_CAMBIOS.md)
- [06 — Despliegue y respaldo](06_DESPLIEGUE_Y_RESPALDO.md)
