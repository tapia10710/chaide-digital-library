# Asistente IA de catálogos

Worker gratuito que redacta respuestas únicamente con las páginas recuperadas
por el buscador de la Biblioteca Digital Chaide. No almacena PDFs, preguntas ni
respuestas y no contiene claves privadas.

## Despliegue

1. Iniciar sesión: `npx wrangler login`.
2. Desplegar: `npx wrangler deploy --config workers/catalog-assistant/wrangler.jsonc`.
3. Copiar la URL `https://chaide-catalog-assistant.<subdominio>.workers.dev` a
   `VITE_CATALOG_ASSISTANT_API_URL` dentro de `.env.firebase`.
4. Ejecutar `npm run build:firebase` y `firebase deploy --only hosting`.

El Worker utiliza la asignación gratuita de Workers AI. Si se agota, devuelve
un error controlado y la aplicación utiliza automáticamente la respuesta local
del buscador. No se debe habilitar el plan de pago para este proyecto.

La redacción utiliza `@cf/meta/llama-3.1-8b-instruct-fp8-fast` con una salida
máxima breve. La corrección ortográfica se ejecuta en el navegador y las
respuestas repetidas se reutilizan en memoria, por lo que estas mejoras no
consumen neuronas adicionales.

## Garantías de vigencia

- Cada fragmento incluye la versión exacta del índice del PDF.
- Una cita solo se acepta si catálogo, versión y página coinciden con la evidencia recibida.
- Las cifras de la respuesta deben existir en las páginas citadas.
- El Worker no conserva conocimiento: cada pregunta recibe únicamente los
  fragmentos vigentes que el navegador acaba de validar contra Firestore.
