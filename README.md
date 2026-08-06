# Dogma Moderador 3.2

Bot de moderación para grupos de WhatsApp basado en Baileys, SQLite y Express.

## Requisitos

- Node.js 22.5 o posterior
- Una cuenta de WhatsApp vinculada

## Instalación

```bash
npm install
cp .env.example .env
npm run check
npm test
npm start
```

## Estructura inicial modular

- `src/bot.js`: conexión, eventos y coordinación principal.
- `src/core/utils.js`: utilidades de mensajes, JID y texto.
- `src/core/permissions.js`: roles y resolución centralizada de permisos.
- `src/services/contentFilters.js`: anti-flood, repetición, emojis, mayúsculas y texto basura.
- `database/storage.js`: persistencia SQLite.

## Seguridad

No compartas ni subas a GitHub `auth/`, `.env` ni los archivos SQLite de `data/`.


## Dashboard en vivo (3.3)

El panel actualiza cada 5 segundos el estado de conexión, uptime, memoria, carga del sistema y actividad de protección sin recargar la página.
