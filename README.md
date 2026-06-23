# Chaide Biblioteca Digital

Biblioteca web de catalogos Chaide construida con React, Vite, TypeScript y Express.

## Sitio publico

https://tapia10710.github.io/chaide-digital-library/

La version de GitHub Pages es de solo lectura e incluye los catalogos, portadas,
PDFs, categorias, busqueda y visor.

## Desarrollo local

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev
```

La aplicacion local queda disponible en `http://localhost:3000`.

## Comandos

```bash
npm run lint
npm run build
npm run build:pages
```

Para habilitar operaciones administrativas en un despliegue con backend,
configure `ADMIN_TOKEN` exclusivamente como variable de entorno del servidor.
