# 🛡️ Dogma Moderador

Bot gratuito y de código abierto para moderación y administración de grupos de WhatsApp.

Desarrollado con Node.js, Baileys, SQLite y Express.

> ⚠️ Proyecto independiente y no oficial. No está afiliado, patrocinado ni aprobado por WhatsApp o Meta. El uso de APIs no oficiales puede implicar riesgos para la cuenta utilizada.

## ✨ Características

Dogma Moderador incluye herramientas de administración y protección automática para grupos:

- 🛡️ Sistema de administradores y permisos
- ⚠️ Sistema de avisos
- 🚫 Anti-enlaces
- 🔁 Anti-spam y mensajes repetidos
- 🌊 Anti-flood
- 🔠 Control de abuso de mayúsculas
- 😀 Control de exceso de emojis
- 🗑️ Detección de texto basura
- 🔇 Silenciar y reactivar usuarios
- ⛔ Ban y unban
- 👢 Expulsión de usuarios
- 👑 Listado de administradores
- 📌 Herramientas de administración
- 📊 Estadísticas reales
- 🌐 Dashboard web
- 📝 Registro de actividad
- 💾 Persistencia mediante SQLite
- 🧩 Arquitectura modular
- 📖 Servicios bíblicos y teológicos
- 💣 Comando de administración masiva con confirmación

## 📋 Requisitos

- Node.js 22.5 o posterior
- npm
- Git
- Una cuenta de WhatsApp para vincular el bot
- Linux, macOS o un VPS

Para algunas funciones multimedia/OCR pueden ser necesarios adicionalmente:

- FFmpeg
- Tesseract OCR

## 🚀 Instalación

Clona el repositorio:

    git clone https://github.com/b4nd1t17/whatsapp-bot.git

Entra en la carpeta:

    cd whatsapp-bot

Instala las dependencias:

    npm install

Crea el archivo de configuración:

    cp .env.example .env

Edita `.env` con tus propios datos.

Después comprueba el proyecto:

    npm run check

Ejecuta los tests:

    npm test

Y arranca el bot:

    npm start

## ⚙️ Configuración

Ejemplo básico:

    PORT=3000
    PANEL_TOKEN=
    PANEL_PUBLIC_URL=http://localhost:3000
    ADMIN_PASSWORD=

No publiques tu archivo `.env`.

## 📱 Vincular WhatsApp

En el primer inicio tendrás que vincular la cuenta de WhatsApp utilizada por el bot.

La sesión generada se almacena localmente.

La carpeta de autenticación NO debe compartirse ni subirse a GitHub.

## 🌐 Dashboard

Dogma Moderador incorpora un dashboard web para consultar información del bot.

Entre otras cosas permite visualizar:

- Estado de conexión
- Uptime
- Memoria
- Carga del sistema
- Estadísticas
- Actividad reciente
- Usuarios bloqueados
- Actividad de moderación

El panel utiliza información real del bot y del sistema.

## 💻 Ejecutarlo 24/7 con PM2

En un VPS puedes utilizar PM2:

    npm install -g pm2

Arranca el bot:

    pm2 start index.js --name dogma-moderador

Guarda la configuración:

    pm2 save

Consulta el estado:

    pm2 status

Consulta los logs:

    pm2 logs dogma-moderador

Reinicia:

    pm2 restart dogma-moderador

Detén el bot:

    pm2 stop dogma-moderador

## 📁 Estructura

    src/
      bot.js
      core/
      dashboard/
      routes/
      services/

    database/
    data/
    plugins/
    tests/

### Componentes principales

`src/bot.js`
Conexión con WhatsApp, procesamiento de mensajes y coordinación principal.

`src/core/utils.js`
Utilidades de mensajes, texto e identificadores JID/LID.

`src/core/permissions.js`
Sistema centralizado de roles y permisos.

`src/services/contentFilters.js`
Filtros automáticos de moderación.

`src/services/bibleService.js`
Funciones relacionadas con contenido bíblico.

`src/services/theologyService.js`
Funciones relacionadas con contenido teológico.

`database/storage.js`
Persistencia mediante SQLite.

`src/dashboard/`
Dashboard web y componentes de administración.

## 🔐 Seguridad

NUNCA publiques:

    .env
    auth/
    auth_backup/
    auth_backup2/
    data/*.sqlite

Tampoco publiques:

- Tokens
- Contraseñas
- Credenciales de WhatsApp
- Claves privadas
- Copias de sesiones

El `.gitignore` del proyecto está preparado para excluir estos datos.

## ⚠️ Comandos destructivos

Algunas funciones administrativas pueden expulsar, banear o modificar participantes del grupo.

Utilízalas únicamente en grupos donde tengas autorización para administrar.

Las funciones de administración masiva deben probarse primero en un grupo de pruebas.

## 🆓 Gratis y Open Source

Dogma Moderador puede descargarse, estudiarse y modificarse gratuitamente.

Si haces modificaciones o mejoras, puedes crear un fork del proyecto.

## ⚠️ Aviso sobre WhatsApp

Este proyecto utiliza Baileys para comunicarse con WhatsApp.

Baileys es una implementación no oficial y este proyecto no está asociado con WhatsApp ni Meta.

Los cambios realizados por WhatsApp pueden afectar al funcionamiento del bot.

Utiliza preferiblemente una cuenta dedicada al bot y úsalo bajo tu propia responsabilidad.

## 🤝 Contribuciones

Las mejoras son bienvenidas.

Puedes:

1. Hacer un fork.
2. Crear una rama.
3. Realizar tus cambios.
4. Crear un Pull Request.

## 🐛 Problemas

Si encuentras un error, puedes abrir un Issue en GitHub explicando:

- Qué estabas haciendo
- Qué ocurrió
- Qué esperabas que ocurriera
- Versión de Node.js
- Sistema operativo

No publiques credenciales ni sesiones en los Issues.

## 📜 Licencia

Antes de redistribuir o incorporar este proyecto a otros productos, revisa la licencia incluida en el repositorio y las licencias de sus dependencias.

---

# Dogma Moderador

Moderación seria, administración automatizada y herramientas para comunidades de WhatsApp.
