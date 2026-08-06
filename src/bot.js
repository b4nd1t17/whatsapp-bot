import "dotenv/config";
import express from "express";
import os from "node:os";
import { cargarDatos, guardarDatos, obtenerResumen, registrarAccion, setLista, estaEnLista, listar, silenciarUsuario, quitarSilencio, obtenerSilencio, obtenerGruposPanel, actualizarAjusteGrupo, actualizarNumeroGrupo, obtenerLogsPanel, asignarRol, obtenerRolGuardado, listarRoles, obtenerResumenAcciones } from "../database/storage.js";

import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import {
  contieneEnlace,
  esperar,
  encontrarPalabraProhibida,
  horaMadrid,
  nombreVisible,
  normalizarParticipantes,
  normalizarTexto,
  obtenerJid,
  obtenerMensajeCitado,
  obtenerTexto
} from "./core/utils.js";
import { crearServicioPermisos, etiquetaRol, tieneNivel } from "./core/permissions.js";
import { crearFiltrosContenido } from "./services/contentFilters.js";
import { crearEstadoDashboard } from "./services/dashboardStats.js";
import { statsService } from "./services/statsService.js";

/* =========================================================
   CONFIGURACIÓN GENERAL
   ========================================================= */

const logger = pino({ level: "silent" });

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = "3.4.0";
const MAX_AVISOS = 3;
const DELAY_EXPULSION = 5000;
const PANEL_TOKEN = process.env.PANEL_TOKEN || "cambia-esta-clave";
const OWNER_JIDS = new Set((process.env.OWNER_JIDS || "").split(",").map(v => v.trim()).filter(Boolean));

const administradoresGuardados = new Map();
const expulsionesProgramadas = new Set();
const informacionGruposPanel = new Map();
const INICIO_BOT = Date.now();
let estadoConexionPanel = "iniciando";

const PALABRAS_INICIALES = [];

/* =========================================================
   ALMACENAMIENTO
   ========================================================= */

let datosBot = cargarDatos();

function obtenerConfiguracion(grupoId) {
  if (!datosBot.grupos[grupoId]) {
    datosBot.grupos[grupoId] = {
      antilink: false,
      bienvenida: true,
      filtroPalabras: true,
      palabrasProhibidas: [...PALABRAS_INICIALES],
      avisos: {},
      antispam: true,
      antiflood: true,
      antimayusculas: false,
      antiemojis: false,
      antibasura: false,
      limiteEmojis: 8,
      porcentajeMayusculas: 70
    };

    guardarDatos(datosBot);
  }

  const configuracion = datosBot.grupos[grupoId];

  configuracion.antilink ??= false;
  configuracion.bienvenida ??= true;
  configuracion.filtroPalabras ??= true;
  configuracion.palabrasProhibidas ??= [
    ...PALABRAS_INICIALES
  ];
  configuracion.avisos ??= {};
  configuracion.antispam ??= true;
  configuracion.antiflood ??= true;
  configuracion.antimayusculas ??= false;
  configuracion.antiemojis ??= false;
  configuracion.antibasura ??= false;
  configuracion.limiteEmojis ??= 8;
  configuracion.porcentajeMayusculas ??= 70;

  return configuracion;
}

/* =========================================================
   SERVICIOS COMPARTIDOS
   ========================================================= */

const {
  demasiadasMayusculas,
  demasiadosEmojis,
  contieneBasuraRepetida,
  detectarFlood,
  detectarRepeticion
} = crearFiltrosContenido();

function obtenerAvisos(configuracion, usuarioId) {
  return Number(
    configuracion.avisos[usuarioId] ?? 0
  );
}

function establecerAvisos(
  configuracion,
  usuarioId,
  cantidad
) {
  if (cantidad <= 0) {
    delete configuracion.avisos[usuarioId];
  } else {
    configuracion.avisos[usuarioId] = cantidad;
  }

  guardarDatos(datosBot);
}

/* =========================================================
   ADMINISTRADORES
   ========================================================= */

function participanteEsAdmin(participante) {
  return (
    participante?.admin === "admin" ||
    participante?.admin === "superadmin" ||
    participante?.admin === true
  );
}

async function obtenerDatosGrupo(socket, grupoId) {
  const metadata =
    await socket.groupMetadata(grupoId);

  const administradores = new Set(
    metadata.participants
      .filter(participanteEsAdmin)
      .map((participante) =>
        obtenerJid(participante)
      )
      .filter(Boolean)
  );

  return {
    metadata,
    administradores
  };
}

async function esAdministrador(
  socket,
  grupoId,
  usuarioId
) {
  const jid = obtenerJid(usuarioId);

  if (!jid) {
    return false;
  }

  const { administradores } =
    await obtenerDatosGrupo(socket, grupoId);

  return administradores.has(jid);
}

const { esPropietarioBot, obtenerRolEfectivo } = crearServicioPermisos({
  ownerJids: OWNER_JIDS,
  obtenerRolGuardado,
  esAdministrador
});

function guardarAdministradores(
  grupoId,
  participantes
) {
  const administradores = new Set(
    participantes
      .filter(participanteEsAdmin)
      .map((participante) =>
        obtenerJid(participante)
      )
      .filter(Boolean)
  );

  administradoresGuardados.set(
    grupoId,
    administradores
  );
}

async function actualizarAdministradores(
  socket,
  grupoId
) {
  try {
    const metadata =
      await socket.groupMetadata(grupoId);

    guardarAdministradores(
      grupoId,
      metadata.participants
    );

    return metadata;
  } catch (error) {
    console.error(
      `⚠️ No se actualizaron los administradores de ${grupoId}:`,
      error.message
    );

    return null;
  }
}

async function cargarTodosLosGrupos(socket) {
  try {
    const grupos =
      await socket.groupFetchAllParticipating();

    for (const [grupoId, metadata] of Object.entries(
      grupos
    )) {
      guardarAdministradores(
        grupoId,
        metadata.participants
      );

      informacionGruposPanel.set(grupoId, {
        nombre: metadata.subject || grupoId,
        participantes: metadata.participants?.length || 0,
        administradores: metadata.participants?.filter(participanteEsAdmin).length || 0,
        actualizadoEn: Date.now()
      });

      obtenerConfiguracion(grupoId);
    }

    console.log(
      `🛡 Administradores registrados de ${
        Object.keys(grupos).length
      } grupos.`
    );
  } catch (error) {
    console.error(
      "⚠️ No se pudieron cargar los grupos:",
      error.message
    );
  }
}

/* =========================================================
   MODERACIÓN
   ========================================================= */

async function borrarMensaje(
  socket,
  chat,
  mensajeKey
) {
  await socket.sendMessage(chat, {
    delete: mensajeKey
  });

  statsService.increment("deleted");
}

async function expulsarConDelay(
  socket,
  chat,
  usuarioId,
  motivo
) {
  const jidUsuario = obtenerJid(usuarioId);

  if (!jidUsuario) {
    console.error(
      "❌ No se pudo identificar al usuario."
    );

    return;
  }

  const clave = `${chat}:${jidUsuario}`;

  if (expulsionesProgramadas.has(clave)) {
    return;
  }

  expulsionesProgramadas.add(clave);

  try {
    await socket.sendMessage(chat, {
      text:
        `🚪 @${nombreVisible(jidUsuario)} será ` +
        `expulsado en 5 segundos.\n\n` +
        `Motivo: ${motivo}`,
      mentions: [jidUsuario]
    });

    await esperar(DELAY_EXPULSION);

    await socket.groupParticipantsUpdate(
      chat,
      [jidUsuario],
      "remove"
    );

    statsService.increment("kicks");

    establecerAvisos(
      obtenerConfiguracion(chat),
      jidUsuario,
      0
    );

    await socket.sendMessage(chat, {
      text:
        `✅ @${nombreVisible(jidUsuario)} ` +
        `ha sido expulsado.`,
      mentions: [jidUsuario]
    });
  } catch (error) {
    console.error(
      "❌ Error al expulsar:",
      error.message
    );

    await socket.sendMessage(chat, {
      text:
        `❌ No pude expulsar a ` +
        `@${nombreVisible(jidUsuario)}.\n\n` +
        `Comprueba que la cuenta vinculada sea administradora.`,
      mentions: [jidUsuario]
    });
  } finally {
    expulsionesProgramadas.delete(clave);
  }
}

async function aplicarAviso(
  socket,
  chat,
  usuarioId,
  configuracion,
  motivo,
  mensajeKey
) {
  const jidUsuario = obtenerJid(usuarioId);

  if (!jidUsuario) {
    return;
  }

  try {
    await borrarMensaje(
      socket,
      chat,
      mensajeKey
    );
  } catch (error) {
    console.error(
      "⚠️ No se pudo borrar el mensaje:",
      error.message
    );
  }

  const avisosAnteriores =
    obtenerAvisos(configuracion, jidUsuario);

  const avisosNuevos = avisosAnteriores + 1;

  establecerAvisos(
    configuracion,
    jidUsuario,
    avisosNuevos
  );

  statsService.increment("warns");

  if (avisosNuevos < MAX_AVISOS) {
    await socket.sendMessage(chat, {
      text:
        `⚠️ *AVISO ${avisosNuevos}/${MAX_AVISOS}*\n\n` +
        `Usuario: @${nombreVisible(jidUsuario)}\n` +
        `Motivo: ${motivo}\n\n` +
        `Al tercer aviso será expulsado.`,
      mentions: [jidUsuario]
    });

    return;
  }

  await socket.sendMessage(chat, {
    text:
      `🚨 @${nombreVisible(jidUsuario)} ha ` +
      `alcanzado ${MAX_AVISOS}/${MAX_AVISOS} avisos.`,
    mentions: [jidUsuario]
  });

  await expulsarConDelay(
    socket,
    chat,
    jidUsuario,
    `ha alcanzado ${MAX_AVISOS} avisos`
  );
}

/* =========================================================
   MENÚ
   ========================================================= */

async function enviarMenu(socket, chat) {
  const menu = `
🤖 *BOT DE MODERACIÓN*

📌 *Comandos generales*

!ping
!estado
!menu
!admins
!avisos

👑 *Comandos de administradores*

!borrar
!warn
!perdonar
!kick
!ban
!unban
!mute 10m
!unmute
!panel
!rol
!roles

🛡 *Protección*

!antilink on
!antilink off
!filtro on
!filtro off
!welcome on
!welcome off
!antispam on/off
!antiflood on/off
!antimayusculas on/off
!antiemojis on/off
!antibasura on/off
!limiteemojis 10
!limitemayusculas 70
!whitelist add/remove/list
!blacklist add/remove/list

🔐 *Permisos*

Responde a un usuario:
!rol moderador
!rol admin
!rol superadmin
!rol usuario
!roles

🚫 *Palabras y frases prohibidas*

!palabras
!palabra añadir texto
!palabra quitar texto

📖 *Uso*

Responde a un mensaje y escribe:

!borrar
Borra el mensaje.

!warn
Borra el mensaje y pone un aviso.

!perdonar
Elimina los avisos del usuario.

!kick
Borra el mensaje y expulsa al usuario tras 5 segundos.

Al tercer aviso, el usuario será expulsado automáticamente.
`.trim();

  await socket.sendMessage(chat, {
    text: menu
  });
}

/* =========================================================
   SERVIDOR HTTP
   ========================================================= */

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function panelAutorizado(req) {
  const token = req.query.token ?? req.body?.token ?? req.headers["x-panel-token"];
  return token === PANEL_TOKEN;
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatoDuracion(ms) {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(totalSegundos / 86400);
  const horas = Math.floor((totalSegundos % 86400) / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  if (dias > 0) return `${dias} d ${horas} h`;
  if (horas > 0) return `${horas} h ${minutos} min`;
  return `${minutos} min`;
}

function nombreAccion(accion) {
  const nombres = {
    warn: "Aviso", kick: "Expulsión", ban: "Ban", unban: "Unban",
    mute: "Silencio", unmute: "Fin del silencio", delete: "Mensaje borrado",
    antispam: "Spam bloqueado", antiflood: "Flood bloqueado",
    promote: "Nuevo administrador", demote: "Administrador degradado",
    admin_removed: "Administrador expulsado"
  };
  return nombres[accion] || accion || "Acción";
}

function plantillaBase({ titulo, contenido, token, refrescar = false }) {
  const tokenSeguro = encodeURIComponent(token);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<style>
:root{--bg:#090b10;--panel:#11151d;--panel2:#171c26;--text:#f4f6fb;--muted:#98a2b3;--line:#283142;--accent:#7c5cff;--ok:#30d17e;--bad:#ff5d73;--warn:#ffbf47}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#080a0f 0%,#0d1118 60%,#111827 100%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}
a{color:inherit;text-decoration:none}.layout{display:grid;grid-template-columns:250px 1fr;min-height:100vh}.sidebar{padding:28px 20px;border-right:1px solid var(--line);background:rgba(8,10,15,.92);position:sticky;top:0;height:100vh}.brand{font-weight:800;font-size:21px;margin-bottom:8px}.version{color:var(--muted);font-size:13px;margin-bottom:28px}.nav a{display:block;padding:12px 14px;border-radius:12px;color:#cbd3e1;margin:4px 0}.nav a:hover,.nav a.active{background:var(--panel2);color:white}.main{padding:34px;max-width:1500px;width:100%}.topbar{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:24px}.title h1{margin:0;font-size:30px}.title p{margin:7px 0 0;color:var(--muted)}.status{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}.dot{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 12px var(--ok)}.dot.off{background:var(--bad);box-shadow:0 0 12px var(--bad)}.status.off{border-color:rgba(255,93,115,.45)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:24px}.card{background:rgba(17,21,29,.9);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 16px 40px rgba(0,0,0,.22)}.metric-label{color:var(--muted);font-size:13px}.metric-value{font-size:30px;font-weight:800;margin-top:8px}.metric-sub{color:var(--muted);font-size:12px;margin-top:5px}.system-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0 0 24px}.progress{height:8px;background:#252c3a;border-radius:999px;overflow:hidden;margin-top:12px}.progress>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#30d17e);border-radius:999px;transition:width .35s}.live{font-size:11px;color:var(--ok);text-transform:uppercase;letter-spacing:.08em}.pulse{animation:pulse 1.7s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}.section-title{display:flex;justify-content:space-between;align-items:center;margin:28px 0 14px}.section-title h2{margin:0;font-size:20px}.search{width:320px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:white}.group-card{background:rgba(17,21,29,.92);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:14px}.group-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:16px}.group-name{font-size:18px;font-weight:750}.group-id{color:var(--muted);font-size:12px;margin-top:5px}.group-meta{color:var(--muted);font-size:13px;white-space:nowrap}.switches{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px}.toggle-form{margin:0}.toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#0d1118;border:1px solid var(--line);color:white;border-radius:13px;padding:12px 13px;cursor:pointer}.toggle:hover{border-color:#4a5570}.toggle-pill{width:42px;height:24px;border-radius:999px;background:#333b4d;padding:3px;display:flex;justify-content:flex-start;transition:.2s}.toggle-pill.on{background:var(--ok);justify-content:flex-end}.toggle-knob{width:18px;height:18px;border-radius:50%;background:white}.log-table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:16px;overflow:hidden}.log-table th,.log-table td{padding:13px 14px;border-bottom:1px solid var(--line);font-size:13px;text-align:left}.log-table th{color:var(--muted);font-weight:600;background:#0d1118}.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#242b3a;color:#dce3ef;font-size:12px}.empty{color:var(--muted);padding:28px;text-align:center}.footer{color:var(--muted);font-size:12px;margin-top:28px}@media(max-width:1050px){.system-grid{grid-template-columns:1fr}.layout{grid-template-columns:1fr}.sidebar{height:auto;position:static;border-right:0;border-bottom:1px solid var(--line)}.nav{display:flex;flex-wrap:wrap}.main{padding:22px}.grid{grid-template-columns:repeat(2,1fr)}.switches{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.grid,.switches{grid-template-columns:1fr}.group-head,.topbar,.section-title{display:block}.search{margin-top:12px;width:100%}}
</style>
${refrescar ? '<meta http-equiv="refresh" content="20">' : ''}
</head>
<body>
<div class="layout">
<aside class="sidebar">
<div class="brand">Dogma Moderador</div><div class="version">Panel v${APP_VERSION}</div>
<nav class="nav">
<a class="active" href="/admin?token=${tokenSeguro}">🏠 Dashboard</a>
<a href="/admin/logs?token=${tokenSeguro}">📝 Registros</a>
<a href="/health">🩺 Estado técnico</a>
</nav>
</aside>
<main class="main">${contenido}<div class="footer">Panel local protegido por token · Los comandos de WhatsApp siguen activos.</div></main>
</div>
</body></html>`;
}

app.get("/admin", (req, res) => {
  if (!panelAutorizado(req)) {
    return res.status(401).send("Acceso denegado. Añade ?token=TU_CLAVE");
  }

  const grupos = obtenerGruposPanel();
  const resumen = obtenerResumen();
  const logsRecientes = obtenerLogsPanel(8);
  const token = String(req.query.token || PANEL_TOKEN);
  const estadoTexto = estadoConexionPanel === "conectado" ? "Bot conectado" : "Conexión en curso";

  const tarjetasGrupos = grupos.map((g) => {
    const info = informacionGruposPanel.get(g.groupId) || {};
    const controles = [
      ["antilink", "Anti enlaces"], ["bienvenida", "Bienvenida"],
      ["filtroPalabras", "Filtro de palabras"], ["antispam", "Anti spam"],
      ["antiflood", "Anti flood"], ["antimayusculas", "Anti mayúsculas"],
      ["antiemojis", "Anti emojis"], ["antibasura", "Anti basura"]
    ].map(([campo, etiqueta]) => `
      <form class="toggle-form" method="post" action="/admin/toggle">
        <input type="hidden" name="token" value="${escaparHtml(token)}">
        <input type="hidden" name="groupId" value="${escaparHtml(g.groupId)}">
        <input type="hidden" name="campo" value="${campo}">
        <input type="hidden" name="valor" value="${g[campo] ? "0" : "1"}">
        <button class="toggle" type="submit"><span>${etiqueta}</span><span class="toggle-pill ${g[campo] ? "on" : ""}"><span class="toggle-knob"></span></span></button>
      </form>`).join("");

    return `<article class="group-card" data-search="${escaparHtml((info.nombre || g.groupId).toLowerCase())} ${escaparHtml(g.groupId.toLowerCase())}">
      <div class="group-head"><div><div class="group-name">${escaparHtml(info.nombre || "Grupo de WhatsApp")}</div><div class="group-id">${escaparHtml(g.groupId)}</div></div>
      <div class="group-meta">${Number(info.participantes || 0)} miembros · ${Number(info.administradores || 0)} administradores</div></div>
      <div class="switches">${controles}</div>
      <form method="post" action="/admin/limits" style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-top:12px">
        <input type="hidden" name="token" value="${escaparHtml(token)}">
        <input type="hidden" name="groupId" value="${escaparHtml(g.groupId)}">
        <label class="toggle" style="cursor:default"><span>Límite emojis</span><input name="limiteEmojis" type="number" min="1" max="100" value="${Number(g.limiteEmojis || 8)}" style="width:72px;background:#111827;color:white;border:1px solid var(--line);border-radius:8px;padding:7px"></label>
        <label class="toggle" style="cursor:default"><span>% mayúsculas</span><input name="porcentajeMayusculas" type="number" min="20" max="100" value="${Number(g.porcentajeMayusculas || 70)}" style="width:72px;background:#111827;color:white;border:1px solid var(--line);border-radius:8px;padding:7px"></label>
        <button class="toggle" type="submit" style="justify-content:center;background:var(--accent)">Guardar límites</button>
      </form>
    </article>`;
  }).join("");

  const filasLogs = logsRecientes.map((x) => `<tr><td>${escaparHtml(x.created_at)}</td><td><span class="badge">${escaparHtml(nombreAccion(x.action))}</span></td><td>${escaparHtml(informacionGruposPanel.get(x.group_id)?.nombre || x.group_id)}</td><td>${escaparHtml(x.reason || "—")}</td></tr>`).join("");

  const contenido = `
    <div class="topbar"><div class="title"><h1>Panel de administración</h1><p>Control central de tus grupos y protecciones.</p></div><div id="estado-bot" class="status"><span id="estado-dot" class="dot"></span><span id="estado-texto">${estadoTexto}</span></div></div>
    <section class="grid">
      <div class="card"><div class="metric-label">Grupos</div><div id="m-grupos" class="metric-value">${resumen.grupos}</div><div class="metric-sub">gestionados por SQLite</div></div>
      <div class="card"><div class="metric-label">Mensajes procesados</div><div id="m-mensajes" class="metric-value">0</div><div class="metric-sub">desde el último arranque</div></div>
      <div class="card"><div class="metric-label">Avisos emitidos</div><div id="m-warns" class="metric-value">0</div><div class="metric-sub"><span id="m-avisos">${resumen.avisosActivos}</span> activos actualmente</div></div>
      <div class="card"><div class="metric-label">Expulsiones</div><div id="m-kicks" class="metric-value">0</div><div class="metric-sub">acciones automáticas y manuales</div></div>
      <div class="card"><div class="metric-label">Spam bloqueado</div><div id="m-spam" class="metric-value">0</div><div class="metric-sub">mensajes repetidos detectados</div></div>
      <div class="card"><div class="metric-label">Flood bloqueado</div><div id="m-flood" class="metric-value">0</div><div class="metric-sub">ráfagas de mensajes detectadas</div></div>
      <div class="card"><div class="metric-label">Acciones registradas</div><div id="m-acciones" class="metric-value">${resumen.acciones}</div><div class="metric-sub">historial de moderación</div></div>
      <div class="card"><div class="metric-label">Tiempo activo <span class="live pulse">● vivo</span></div><div id="m-uptime" class="metric-value" style="font-size:22px">${formatoDuracion(Date.now() - INICIO_BOT)}</div><div class="metric-sub">Dogma Moderador ${APP_VERSION}</div></div>
    </section>
    <section class="system-grid">
      <div class="card"><div class="metric-label">Memoria del proceso</div><div id="m-memoria" class="metric-value" style="font-size:24px">—</div><div class="progress"><span id="p-memoria" style="width:0%"></span></div><div id="s-memoria" class="metric-sub">Calculando…</div></div>
      <div class="card"><div class="metric-label">Carga del sistema</div><div id="m-cpu" class="metric-value" style="font-size:24px">—</div><div class="progress"><span id="p-cpu" style="width:0%"></span></div><div id="s-cpu" class="metric-sub">Calculando…</div></div>
      <div class="card"><div class="metric-label">Actividad registrada</div><div id="m-bloqueos" class="metric-value" style="font-size:24px">—</div><div id="s-bloqueos" class="metric-sub">spam, flood y borrados</div></div>
    </section>
    <div class="section-title"><h2>Grupos</h2><input id="buscarGrupo" class="search" placeholder="Buscar grupo..."></div>
    <div id="listaGrupos">${tarjetasGrupos || '<div class="card empty">Aún no hay grupos configurados.</div>'}</div>
    <div class="section-title"><h2>Actividad reciente</h2><a href="/admin/logs?token=${encodeURIComponent(token)}">Ver todos →</a></div>
    <div class="card" style="padding:0;overflow:auto"><table class="log-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Grupo</th><th>Motivo</th></tr></thead><tbody>${filasLogs || '<tr><td colspan="4" class="empty">Todavía no hay acciones registradas.</td></tr>'}</tbody></table></div>
    <script>
      const input=document.getElementById('buscarGrupo');
      input?.addEventListener('input',()=>{const q=input.value.toLowerCase().trim();document.querySelectorAll('.group-card').forEach(card=>{card.style.display=card.dataset.search.includes(q)?'block':'none';});});
      const tokenPanel=${JSON.stringify(token)};
      const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
      const setBar=(id,value)=>{const el=document.getElementById(id);if(el)el.style.width=Math.max(0,Math.min(100,Number(value)||0))+'%';};
      async function actualizarDashboard(){
        try{
          const respuesta=await fetch('/admin/api/status?token='+encodeURIComponent(tokenPanel),{cache:'no-store'});
          if(!respuesta.ok)return;
          const d=await respuesta.json();
          setText('m-grupos',d.resumen.grupos);
          setText('m-avisos',d.resumen.avisosActivos);
          setText('m-acciones',d.resumen.acciones);
          setText('m-mensajes',d.contadores.messages);
          setText('m-warns',d.contadores.warns);
          setText('m-kicks',d.contadores.kicks);
          setText('m-spam',d.contadores.spam);
          setText('m-flood',d.contadores.flood);
          setText('m-uptime',d.uptimeTexto);
          const estado=document.getElementById('estado-bot');
          const punto=document.getElementById('estado-dot');
          setText('estado-texto',d.ok?'Bot conectado':'Bot desconectado');
          estado?.classList.toggle('off',!d.ok);
          punto?.classList.toggle('off',!d.ok);
          setText('m-memoria',d.memoria.rssTexto);
          setText('s-memoria',d.memoria.heapTexto+' · '+d.sistema.ramLibreTexto+' libres en el Mac');
          setBar('p-memoria',d.memoria.porcentajeSistema);
          setText('m-cpu',d.sistema.cargaTexto);
          setText('s-cpu',d.sistema.cpus+' núcleos · Node '+d.node);
          setBar('p-cpu',d.sistema.cargaPorcentaje);
          setText('m-bloqueos',d.accionesProteccion);
        }catch(_error){}
      }
      actualizarDashboard();
      setInterval(actualizarDashboard,5000);
    </script>`;

  res.send(plantillaBase({ titulo: "Dogma Moderador", contenido, token }));
});

app.post("/admin/toggle", (req, res) => {
  if (!panelAutorizado(req)) return res.status(401).send("Acceso denegado");
  const { groupId, campo, valor } = req.body;
  try {
    actualizarAjusteGrupo(groupId, campo, valor === "1");
    datosBot = cargarDatos();
    res.redirect(`/admin?token=${encodeURIComponent(req.body.token || PANEL_TOKEN)}`);
  } catch (error) {
    res.status(400).send(`Error: ${escaparHtml(error.message)}`);
  }
});

app.post("/admin/limits", (req, res) => {
  if (!panelAutorizado(req)) return res.status(401).send("Acceso denegado");
  try {
    actualizarNumeroGrupo(req.body.groupId, "limiteEmojis", req.body.limiteEmojis);
    actualizarNumeroGrupo(req.body.groupId, "porcentajeMayusculas", req.body.porcentajeMayusculas);
    datosBot = cargarDatos();
    res.redirect(`/admin?token=${encodeURIComponent(req.body.token || PANEL_TOKEN)}`);
  } catch (error) { res.status(400).send(`Error: ${escaparHtml(error.message)}`); }
});

app.get("/admin/api/status", (req, res) => {
  if (!panelAutorizado(req)) return res.status(401).json({ ok: false, error: "Acceso denegado" });
  const resumen = obtenerResumen();
  const acciones = obtenerResumenAcciones();
  const estado = crearEstadoDashboard({
    inicioBot: INICIO_BOT,
    resumen,
    acciones,
    estadoConexion: estadoConexionPanel,
    memoriaProceso: process.memoryUsage(),
    memoriaTotal: os.totalmem(),
    memoriaLibre: os.freemem(),
    carga1m: os.loadavg()[0],
    cpus: os.cpus().length,
    nodeVersion: process.version,
    version: APP_VERSION,
    contadores: statsService.getAll()
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(estado);
});

app.get("/admin/api/stats", (req, res) => {
  if (!panelAutorizado(req)) {
    return res.status(401).json({ ok: false, error: "Acceso denegado" });
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    version: APP_VERSION,
    uptimeMs: Date.now() - INICIO_BOT,
    counters: statsService.getAll()
  });
});

app.get("/admin/logs", (req, res) => {
  if (!panelAutorizado(req)) return res.status(401).send("Acceso denegado");
  const token = String(req.query.token || PANEL_TOKEN);
  const logs = obtenerLogsPanel(250);
  const filas = logs.map((x) => `<tr><td>${x.id}</td><td>${escaparHtml(x.created_at)}</td><td>${escaparHtml(informacionGruposPanel.get(x.group_id)?.nombre || x.group_id)}</td><td><span class="badge">${escaparHtml(nombreAccion(x.action))}</span></td><td>${escaparHtml(x.actor_id || "—")}</td><td>${escaparHtml(x.target_id || "—")}</td><td>${escaparHtml(x.reason || "—")}</td></tr>`).join("");
  const contenido = `<div class="topbar"><div class="title"><h1>Registros de moderación</h1><p>Últimas ${logs.length} acciones guardadas en SQLite.</p></div><a href="/admin?token=${encodeURIComponent(token)}">← Volver</a></div><div class="card" style="padding:0;overflow:auto"><table class="log-table"><thead><tr><th>ID</th><th>Fecha</th><th>Grupo</th><th>Acción</th><th>Actor</th><th>Objetivo</th><th>Motivo</th></tr></thead><tbody>${filas || '<tr><td colspan="7" class="empty">Sin registros.</td></tr>'}</tbody></table></div>`;
  res.send(plantillaBase({ titulo: "Registros", contenido, token }));
});

app.get("/", (_req, res) => {
  res.send("WhatsApp Bot funcionando correctamente");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: estadoConexionPanel === "conectado",
    estado: estadoConexionPanel,
    servicio: "dogma-moderador",
    version: APP_VERSION,
    uptimeMs: Date.now() - INICIO_BOT,
    fecha: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`);
});

/* =========================================================
   CONEXIÓN CON WHATSAPP
   ========================================================= */

async function iniciarBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const socket = makeWASocket({
    auth: state,
    logger,

    browser: Browsers.macOS(
      "Bandit17 Moderador"
    ),

    markOnlineOnConnect: false,

    shouldSyncHistoryMessage: () => false
  });

  socket.ev.on(
    "creds.update",
    saveCreds
  );

  socket.ev.on(
    "connection.update",
    ({
      connection,
      lastDisconnect,
      qr
    }) => {
      if (qr) {
        console.log(
          "\n📱 Escanea este QR desde WhatsApp:\n"
        );

        qrcode.generate(qr, {
          small: true
        });
      }

      if (connection === "open") {
        estadoConexionPanel = "conectado";
        console.log(
          "✅ Bot conectado correctamente."
        );

        cargarTodosLosGrupos(socket).catch(
          console.error
        );
      }

      if (connection === "close") {
        estadoConexionPanel = "desconectado";
        const codigo =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : undefined;

        const sesionCerrada =
          codigo === DisconnectReason.loggedOut;

        if (sesionCerrada) {
          console.log(
            "❌ WhatsApp cerró la sesión."
          );

          console.log(
            "Borra la carpeta auth y vuelve a escanear el QR."
          );

          return;
        }

        console.log(
          "⚠️ Conexión cerrada. Reconectando..."
        );

        setTimeout(() => {
          iniciarBot().catch(console.error);
        }, 3000);
      }
    }
  );

  /* =======================================================
     CAMBIOS EN LOS PARTICIPANTES
     ======================================================= */

  socket.ev.on(
    "group-participants.update",
    async (actualizacion) => {
      const grupoId = obtenerJid(
        actualizacion?.id
      );

      const participantes =
        normalizarParticipantes(
          actualizacion?.participants
        );

      const accion = actualizacion?.action;

      const responsable = obtenerJid(
        actualizacion?.author
      );

      if (!grupoId) {
        console.error(
          "⚠️ Evento de grupo sin identificador válido."
        );

        return;
      }

      try {
        const configuracion =
          obtenerConfiguracion(grupoId);

        const administradoresAnteriores =
          administradoresGuardados.get(grupoId) ??
          new Set();

        /*
          EXPULSIÓN O SALIDA
        */

        if (accion === "remove") {
          for (const participante of participantes) {
            const eraAdministrador =
              administradoresAnteriores.has(
                participante
              );

            if (eraAdministrador) {
              const menciones = [participante];

              let aviso =
                `🚨 *ALERTA DE ADMINISTRACIÓN*\n\n` +
                `El administrador ` +
                `@${nombreVisible(participante)} ` +
                `ha sido expulsado o ha salido del grupo.\n\n`;

              if (
                responsable &&
                responsable !== participante
              ) {
                aviso +=
                  `👤 Acción realizada por: ` +
                  `@${nombreVisible(responsable)}`;

                menciones.push(responsable);
              } else {
                aviso +=
                  "👤 Responsable: no identificado por WhatsApp.";
              }

              aviso +=
                `\n🕒 Hora: ${horaMadrid()}`;

              await socket.sendMessage(grupoId, {
                text: aviso,
                mentions: menciones
              });

              console.log(
                `🚨 Administrador eliminado: ${participante}`
              );

              continue;
            }

            if (configuracion.bienvenida) {
              await socket.sendMessage(grupoId, {
                text:
                  `👋 @${nombreVisible(participante)} ` +
                  `ha salido o ha sido eliminado del grupo.`,
                mentions: [participante]
              });
            }
          }
        }

        /*
          QUITAR ADMINISTRADOR
        */

        if (accion === "demote") {
          for (const participante of participantes) {
            const eraAdministrador =
              administradoresAnteriores.has(
                participante
              );

            if (!eraAdministrador) {
              continue;
            }

            const menciones = [participante];

            let aviso =
              `⚠️ *CAMBIO EN LA ADMINISTRACIÓN*\n\n` +
              `A @${nombreVisible(participante)} ` +
              `le han quitado el cargo de administrador.\n\n`;

            if (
              responsable &&
              responsable !== participante
            ) {
              aviso +=
                `👤 Acción realizada por: ` +
                `@${nombreVisible(responsable)}`;

              menciones.push(responsable);
            } else {
              aviso +=
                "👤 Responsable: no identificado por WhatsApp.";
            }

            aviso +=
              `\n🕒 Hora: ${horaMadrid()}`;

            await socket.sendMessage(grupoId, {
              text: aviso,
              mentions: menciones
            });

            console.log(
              `⚠️ Administrador degradado: ${participante}`
            );
          }
        }

        /*
          NOMBRAR ADMINISTRADOR
        */

        if (accion === "promote") {
          for (const participante of participantes) {
            const menciones = [participante];

            let aviso =
              `👑 *NUEVO ADMINISTRADOR*\n\n` +
              `@${nombreVisible(participante)} ` +
              `ha sido nombrado administrador.`;

            if (
              responsable &&
              responsable !== participante
            ) {
              aviso +=
                `\n\n👤 Acción realizada por: ` +
                `@${nombreVisible(responsable)}`;

              menciones.push(responsable);
            }

            aviso +=
              `\n🕒 Hora: ${horaMadrid()}`;

            await socket.sendMessage(grupoId, {
              text: aviso,
              mentions: menciones
            });
          }
        }

        /*
          BIENVENIDA
        */

        if (
          accion === "add" &&
          configuracion.bienvenida
        ) {
          for (const participante of participantes) {
            await socket.sendMessage(grupoId, {
              text:
                `👋 Bienvenido al grupo, ` +
                `@${nombreVisible(participante)}.`,
              mentions: [participante]
            });
          }
        }

        await esperar(1500);

        const metadataActualizada = await actualizarAdministradores(
          socket,
          grupoId
        );

        if (metadataActualizada) {
          informacionGruposPanel.set(grupoId, {
            nombre: metadataActualizada.subject || grupoId,
            participantes: metadataActualizada.participants?.length || 0,
            administradores: metadataActualizada.participants?.filter(participanteEsAdmin).length || 0,
            actualizadoEn: Date.now()
          });
        }
      } catch (error) {
        console.error(
          "❌ Error procesando participantes:",
          error.message
        );
      }
    }
  );

  /* =======================================================
     MENSAJES
     ======================================================= */

  socket.ev.on(
    "messages.upsert",
    async ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }

      for (const mensaje of messages) {
        try {
          if (!mensaje.message) {
            continue;
          }

          if (mensaje.key.fromMe) {
            continue;
          }

          const chat = obtenerJid(
            mensaje.key.remoteJid
          );

          const autor = obtenerJid(
            mensaje.key.participant ??
            mensaje.key.remoteJid
          );

          if (!chat || !autor) {
            continue;
          }

          const esGrupo =
            chat.endsWith("@g.us");

          const texto =
            obtenerTexto(
              mensaje.message
            ).trim();

          const comando =
            normalizarTexto(texto);

          console.log(
            `📩 ${
              esGrupo ? "Grupo" : "Privado"
            }: ${texto}`
          );

          statsService.increment("messages");

          if (comando === "!ping") {
            await socket.sendMessage(chat, {
              text:
                "🏓 Pong. El bot está funcionando."
            });

            continue;
          }

          if (comando === "!estado") {
            const resumen = obtenerResumen();
            const segundos = Math.floor(process.uptime());
            const dias = Math.floor(segundos / 86400);
            const horas = Math.floor((segundos % 86400) / 3600);
            const minutos = Math.floor((segundos % 3600) / 60);

            await socket.sendMessage(chat, {
              text:
                `🤖 *Dogma Moderador v3.0*\n\n` +
                `Estado: 🟢 Online\n` +
                `Grupos configurados: ${resumen.grupos}\n` +
                `Avisos activos: ${resumen.avisosActivos}\n` +
                `Acciones registradas: ${resumen.acciones}\n` +
                `Tiempo activo: ${dias}d ${horas}h ${minutos}m`
            });

            continue;
          }

          if (
            comando === "!menu" ||
            comando === "!ayuda"
          ) {
            await enviarMenu(socket, chat);

            continue;
          }

          if (!esGrupo) {
            continue;
          }

          const configuracion =
            obtenerConfiguracion(chat);

          let autorEsAdmin = false;

          try {
            autorEsAdmin =
              await esAdministrador(
                socket,
                chat,
                autor
              );
          } catch (error) {
            console.error(
              "⚠️ No se pudo comprobar el administrador:",
              error.message
            );
          }

          const rolAutor = await obtenerRolEfectivo(socket, chat, autor, autorEsAdmin);

          const silencio = obtenerSilencio(chat, autor);
          if (silencio && !autorEsAdmin) {
            try { await borrarMensaje(socket, chat, mensaje.key); } catch {}
            continue;
          }

          const protegido = estaEnLista(chat, autor, "white");
          if (estaEnLista(chat, autor, "black") && !autorEsAdmin) {
            await expulsarConDelay(socket, chat, autor, "usuario incluido en la lista negra");
            continue;
          }
          if (!autorEsAdmin && !protegido && configuracion.antiflood && detectarFlood(chat, autor)) {
            await aplicarAviso(socket, chat, autor, configuracion, "flood: demasiados mensajes en pocos segundos", mensaje.key);
            registrarAccion({groupId:chat,targetId:autor,action:"antiflood",reason:"6 mensajes en 10 segundos"});
            statsService.increment("flood");
            continue;
          }
          if (!autorEsAdmin && !protegido && configuracion.antispam && detectarRepeticion(chat, autor, texto)) {
            await aplicarAviso(socket, chat, autor, configuracion, "spam: mensaje repetido", mensaje.key);
            registrarAccion({groupId:chat,targetId:autor,action:"antispam",reason:"mensaje repetido 3 veces"});
            statsService.increment("spam");
            continue;
          }
          if (!autorEsAdmin && !protegido && configuracion.antimayusculas && demasiadasMayusculas(texto, configuracion.porcentajeMayusculas)) {
            await aplicarAviso(socket, chat, autor, configuracion, "uso excesivo de mayúsculas", mensaje.key); continue;
          }
          if (!autorEsAdmin && !protegido && configuracion.antiemojis && demasiadosEmojis(texto, configuracion.limiteEmojis)) {
            await aplicarAviso(socket, chat, autor, configuracion, "uso excesivo de emojis", mensaje.key); continue;
          }
          if (!autorEsAdmin && !protegido && configuracion.antibasura && contieneBasuraRepetida(texto)) {
            await aplicarAviso(socket, chat, autor, configuracion, "caracteres o símbolos repetidos en exceso", mensaje.key);
            registrarAccion({groupId:chat,targetId:autor,action:"antibasura",reason:"repetición excesiva de caracteres"});
            continue;
          }

          /*
            FILTRO DE PALABRAS
          */

          if (
            configuracion.filtroPalabras &&
            !autorEsAdmin &&
            !comando.startsWith("!")
          ) {
            const palabraDetectada =
              encontrarPalabraProhibida(
                texto,
                configuracion.palabrasProhibidas
              );

            if (palabraDetectada) {
              await aplicarAviso(
                socket,
                chat,
                autor,
                configuracion,
                `palabra o frase prohibida: "${palabraDetectada}"`,
                mensaje.key
              );

              continue;
            }
          }

          /*
            ANTIENLACES
          */

          if (
            configuracion.antilink &&
            !autorEsAdmin &&
            contieneEnlace(texto)
          ) {
            await aplicarAviso(
              socket,
              chat,
              autor,
              configuracion,
              "publicación de enlaces no permitidos",
              mensaje.key
            );

            continue;
          }

          /*
            ADMINISTRADORES
          */

          if (comando === "!admins") {
            const { metadata } =
              await obtenerDatosGrupo(
                socket,
                chat
              );

            const admins =
              metadata.participants.filter(
                participanteEsAdmin
              );

            const menciones = admins
              .map((participante) =>
                obtenerJid(participante)
              )
              .filter(Boolean);

            const lista = menciones
              .map(
                (jid, indice) =>
                  `${indice + 1}. ` +
                  `@${nombreVisible(jid)}`
              )
              .join("\n");

            await socket.sendMessage(chat, {
              text:
                `👑 *Administradores del grupo*\n\n` +
                `${lista || "No encontrados."}`,
              mentions: menciones
            });

            continue;
          }

          /*
            CONSULTAR AVISOS
          */

          if (comando === "!avisos") {
            const citado =
              obtenerMensajeCitado(
                mensaje.message,
                chat
              );

            const objetivo =
              citado?.participant ?? autor;

            const cantidad =
              obtenerAvisos(
                configuracion,
                objetivo
              );

            await socket.sendMessage(chat, {
              text:
                `⚠️ @${nombreVisible(objetivo)} ` +
                `tiene ${cantidad}/${MAX_AVISOS} avisos.`,
              mentions: [objetivo]
            });

            continue;
          }

          const comandoMinimo = (() => {
            if (["!borrar", "!warn", "!perdonar"].includes(comando)) return "moderador";
            if (comando === "!kick" || comando === "!ban" || comando === "!unban" ||
                comando.startsWith("!mute") || comando === "!unmute") return "admin";
            if (comando === "!panel" || comando === "!palabras" ||
                comando.startsWith("!antilink ") || comando.startsWith("!welcome ") ||
                comando.startsWith("!filtro ") || comando.startsWith("!palabra ") ||
                comando.startsWith("!antispam ") || comando.startsWith("!antiflood ") ||
                comando.startsWith("!antimayusculas ") || comando.startsWith("!antiemojis ") ||
                comando.startsWith("!antibasura ") || comando.startsWith("!limiteemojis ") ||
                comando.startsWith("!limitemayusculas ") || comando.startsWith("!whitelist ") ||
                comando.startsWith("!blacklist ")) return "admin";
            if (comando.startsWith("!rol ") || comando === "!roles") return "superadmin";
            return null;
          })();

          if (comandoMinimo && !tieneNivel(rolAutor, comandoMinimo)) {
            await socket.sendMessage(chat, {
              text: `⛔ Necesitas el nivel ${etiquetaRol(comandoMinimo)} para usar este comando.\nTu nivel: ${etiquetaRol(rolAutor)}`
            });
            continue;
          }

          if (comando === "!rol") {
            await socket.sendMessage(chat, { text: `🔐 Tu nivel es: ${etiquetaRol(rolAutor)}\nID: ${autor}` });
            continue;
          }

          if (comando === "!roles") {
            const filas = listarRoles(chat);
            const textoRoles = filas.length
              ? filas.map((fila, i) => `${i + 1}. @${nombreVisible(fila.user_id)} — ${etiquetaRol(fila.role)}`).join("\n")
              : "No hay roles especiales asignados. Los administradores de WhatsApp tienen nivel Admin automáticamente.";
            await socket.sendMessage(chat, { text: `🔐 *Roles del bot*\n\n${textoRoles}`, mentions: filas.map(f => f.user_id) });
            continue;
          }

          if (comando.startsWith("!rol ")) {
            const citado = obtenerMensajeCitado(mensaje.message, chat);
            if (!citado) {
              await socket.sendMessage(chat, { text: "Responde al mensaje del usuario y escribe !rol moderador, !rol admin, !rol superadmin o !rol usuario" });
              continue;
            }
            const rolNuevo = comando.slice(5).trim();
            if (!["usuario", "moderador", "admin", "superadmin"].includes(rolNuevo)) {
              await socket.sendMessage(chat, { text: "Rol no válido. Usa: usuario, moderador, admin o superadmin." });
              continue;
            }
            if (rolNuevo === "superadmin" && rolAutor !== "propietario") {
              await socket.sendMessage(chat, { text: "⛔ Solo el propietario puede nombrar SuperAdmins." });
              continue;
            }
            const rolObjetivo = await obtenerRolEfectivo(socket, chat, citado.participant);
            if (rolObjetivo === "propietario") {
              await socket.sendMessage(chat, { text: "⛔ No se puede cambiar el rol del propietario." });
              continue;
            }
            if (rolAutor === "superadmin" && tieneNivel(rolObjetivo, "superadmin")) {
              await socket.sendMessage(chat, { text: "⛔ Un SuperAdmin no puede modificar a otro SuperAdmin." });
              continue;
            }
            asignarRol(chat, citado.participant, rolNuevo, autor);
            registrarAccion({ groupId: chat, actorId: autor, targetId: citado.participant, action: "role_change", reason: rolNuevo });
            await socket.sendMessage(chat, {
              text: `✅ @${nombreVisible(citado.participant)} ahora tiene el nivel ${etiquetaRol(rolNuevo)}.`,
              mentions: [citado.participant]
            });
            continue;
          }

          /*
            CONFIGURACIÓN
          */

          if (comando === "!antilink on") {
            configuracion.antilink = true;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text: "🛡 Antienlaces activado."
            });

            continue;
          }

          if (comando === "!antilink off") {
            configuracion.antilink = false;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text: "🛡 Antienlaces desactivado."
            });

            continue;
          }

          if (comando === "!welcome on") {
            configuracion.bienvenida = true;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                "👋 Bienvenida automática activada."
            });

            continue;
          }

          if (comando === "!welcome off") {
            configuracion.bienvenida = false;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                "👋 Bienvenida automática desactivada."
            });

            continue;
          }

          if (comando === "!filtro on") {
            configuracion.filtroPalabras = true;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                "🚫 Filtro de palabras activado."
            });

            continue;
          }

          if (comando === "!filtro off") {
            configuracion.filtroPalabras = false;
            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                "🚫 Filtro de palabras desactivado."
            });

            continue;
          }

          const toggles = [
            ["!antispam", "antispam", "Anti-spam"], ["!antiflood", "antiflood", "Anti-flood"],
            ["!antimayusculas", "antimayusculas", "Anti-mayúsculas"], ["!antiemojis", "antiemojis", "Anti-emojis"], ["!antibasura", "antibasura", "Anti-basura"]
          ];
          let toggleAplicado=false;
          for (const [cmd,campo,nombre] of toggles) {
            if (comando===`${cmd} on` || comando===`${cmd} off`) {
              configuracion[campo]=comando.endsWith(" on"); guardarDatos(datosBot);
              await socket.sendMessage(chat,{text:`${configuracion[campo]?"✅":"❌"} ${nombre} ${configuracion[campo]?"activado":"desactivado"}.`});
              toggleAplicado=true; break;
            }
          }
          if (toggleAplicado) continue;

          const limiteEmojiMatch = comando.match(/^!limiteemojis\s+(\d+)$/);
          if (limiteEmojiMatch) {
            const n=Number(limiteEmojiMatch[1]);
            if (n<1 || n>100) { await socket.sendMessage(chat,{text:"El límite debe estar entre 1 y 100."}); continue; }
            configuracion.limiteEmojis=n; guardarDatos(datosBot);
            await socket.sendMessage(chat,{text:`✅ Límite de emojis fijado en ${n} por mensaje.`}); continue;
          }
          const limiteMayusMatch = comando.match(/^!limitemayusculas\s+(\d+)$/);
          if (limiteMayusMatch) {
            const n=Number(limiteMayusMatch[1]);
            if (n<20 || n>100) { await socket.sendMessage(chat,{text:"El porcentaje debe estar entre 20 y 100."}); continue; }
            configuracion.porcentajeMayusculas=n; guardarDatos(datosBot);
            await socket.sendMessage(chat,{text:`✅ Umbral de mayúsculas fijado en ${n}%.`}); continue;
          }

          for (const [prefijo,tipo,nombre] of [["!whitelist","white","lista blanca"],["!blacklist","black","lista negra"]]) {
            if (comando===`${prefijo} list`) {
              const ids=listar(chat,tipo);
              await socket.sendMessage(chat,{text:`📋 *${nombre}*\n\n${ids.length?ids.map((x,i)=>`${i+1}. @${nombreVisible(x)}`).join("\n"):"Vacía"}`,mentions:ids});
              toggleAplicado=true; break;
            }
            if (comando===`${prefijo} add` || comando===`${prefijo} remove`) {
              const citado=obtenerMensajeCitado(mensaje.message,chat);
              if (!citado) { await socket.sendMessage(chat,{text:`Responde al mensaje del usuario y escribe ${prefijo} add o ${prefijo} remove`}); toggleAplicado=true; break; }
              const add=comando.endsWith(" add"); setLista(chat,citado.participant,tipo,add);
              await socket.sendMessage(chat,{text:`${add?"✅ Añadido a":"✅ Eliminado de"} la ${nombre}: @${nombreVisible(citado.participant)}`,mentions:[citado.participant]});
              toggleAplicado=true; break;
            }
          }
          if (toggleAplicado) continue;

          /*
            PALABRAS PROHIBIDAS
          */

          if (comando === "!palabras") {
            const lista =
              configuracion.palabrasProhibidas.length > 0
                ? configuracion.palabrasProhibidas
                    .map(
                      (palabra, indice) =>
                        `${indice + 1}. ${palabra}`
                    )
                    .join("\n")
                : "No hay palabras configuradas.";

            await socket.sendMessage(chat, {
              text:
                `🚫 *Palabras y frases prohibidas*\n\n${lista}`
            });

            continue;
          }

          const coincidenciaAñadir =
            texto.match(/^!palabra\s+añadir\s+(.+)$/i);

          if (coincidenciaAñadir) {
            const nuevaPalabra =
              coincidenciaAñadir[1].trim();

            const yaExiste =
              configuracion.palabrasProhibidas.some(
                (palabra) =>
                  normalizarTexto(palabra) ===
                  normalizarTexto(nuevaPalabra)
              );

            if (yaExiste) {
              await socket.sendMessage(chat, {
                text:
                  "⚠️ Esa palabra o frase ya está en la lista."
              });

              continue;
            }

            configuracion.palabrasProhibidas.push(
              nuevaPalabra
            );

            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                `✅ Añadida a la lista prohibida:\n${nuevaPalabra}`
            });

            continue;
          }

          const coincidenciaQuitar =
            texto.match(/^!palabra\s+quitar\s+(.+)$/i);

          if (coincidenciaQuitar) {
            const palabraAQuitar =
              coincidenciaQuitar[1].trim();

            const indice =
              configuracion.palabrasProhibidas.findIndex(
                (palabra) =>
                  normalizarTexto(palabra) ===
                  normalizarTexto(palabraAQuitar)
              );

            if (indice === -1) {
              await socket.sendMessage(chat, {
                text:
                  "⚠️ Esa palabra o frase no está en la lista."
              });

              continue;
            }

            const [eliminada] =
              configuracion.palabrasProhibidas.splice(
                indice,
                1
              );

            guardarDatos(datosBot);

            await socket.sendMessage(chat, {
              text:
                `✅ Eliminada de la lista:\n${eliminada}`
            });

            continue;
          }

          /*
            BORRAR MENSAJE
          */

          if (comando === "!borrar") {
            const citado =
              obtenerMensajeCitado(
                mensaje.message,
                chat
              );

            if (!citado) {
              await socket.sendMessage(chat, {
                text:
                  "Responde al mensaje que quieres borrar y escribe !borrar"
              });

              continue;
            }

            try {
              await borrarMensaje(
                socket,
                chat,
                citado.key
              );

              await socket.sendMessage(chat, {
                text: "🗑 Mensaje eliminado."
              });
            } catch (error) {
              await socket.sendMessage(chat, {
                text:
                  "❌ No pude borrar el mensaje. Comprueba que la cuenta vinculada sea administradora."
              });
            }

            continue;
          }

          /*
            AVISO MANUAL
          */

          if (comando === "!warn") {
            const citado =
              obtenerMensajeCitado(
                mensaje.message,
                chat
              );

            if (!citado) {
              await socket.sendMessage(chat, {
                text:
                  "Responde al mensaje del usuario y escribe !warn"
              });

              continue;
            }

            const objetivoEsAdmin =
              await esAdministrador(
                socket,
                chat,
                citado.participant
              );

            if (objetivoEsAdmin) {
              await socket.sendMessage(chat, {
                text:
                  "⛔ No puedo aplicar avisos automáticos a otro administrador."
              });

              continue;
            }

            await aplicarAviso(
              socket,
              chat,
              citado.participant,
              configuracion,
              "aviso manual de un administrador",
              citado.key
            );

            continue;
          }

          /*
            PERDONAR AVISOS
          */

          if (comando === "!perdonar") {
            const citado =
              obtenerMensajeCitado(
                mensaje.message,
                chat
              );

            if (!citado) {
              await socket.sendMessage(chat, {
                text:
                  "Responde al mensaje del usuario y escribe !perdonar"
              });

              continue;
            }

            establecerAvisos(
              configuracion,
              citado.participant,
              0
            );

            await socket.sendMessage(chat, {
              text:
                `✅ Se han eliminado todos los avisos de ` +
                `@${nombreVisible(citado.participant)}.`,
              mentions: [citado.participant]
            });

            continue;
          }

          if (comando === "!panel") {
            const host = process.env.PANEL_PUBLIC_URL || `http://localhost:${PORT}`;
            await socket.sendMessage(chat, { text: `🌐 Panel: ${host}/admin\n\nLa clave se configura en el archivo .env y no debe publicarse en el grupo.` });
            continue;
          }

          if (comando.startsWith("!mute")) {
            const citado = obtenerMensajeCitado(mensaje.message, chat);
            if (!citado) { await socket.sendMessage(chat,{text:"Responde al mensaje del usuario y escribe !mute 10m"}); continue; }
            const objetivoEsAdmin = await esAdministrador(socket,chat,citado.participant);
            if (objetivoEsAdmin) { await socket.sendMessage(chat,{text:"⛔ No puedo silenciar a otro administrador."}); continue; }
            const match = texto.match(/^!mute(?:\s+(\d+)(m|h|d))?$/i);
            const cantidad = Number(match?.[1] || 10);
            const unidad = (match?.[2] || "m").toLowerCase();
            const factor = unidad === "d" ? 86400000 : unidad === "h" ? 3600000 : 60000;
            const vence = Date.now() + cantidad * factor;
            silenciarUsuario(chat,citado.participant,vence,autor);
            registrarAccion({groupId:chat,actorId:autor,targetId:citado.participant,action:"mute",reason:`${cantidad}${unidad}`});
            await socket.sendMessage(chat,{text:`🔇 @${nombreVisible(citado.participant)} silenciado durante ${cantidad}${unidad}.`,mentions:[citado.participant]});
            continue;
          }

          if (comando === "!unmute") {
            const citado = obtenerMensajeCitado(mensaje.message, chat);
            if (!citado) { await socket.sendMessage(chat,{text:"Responde al mensaje del usuario y escribe !unmute"}); continue; }
            quitarSilencio(chat,citado.participant);
            registrarAccion({groupId:chat,actorId:autor,targetId:citado.participant,action:"unmute"});
            await socket.sendMessage(chat,{text:`🔊 Silencio retirado a @${nombreVisible(citado.participant)}.`,mentions:[citado.participant]});
            continue;
          }

          if (comando === "!ban") {
            const citado = obtenerMensajeCitado(mensaje.message, chat);
            if (!citado) { await socket.sendMessage(chat,{text:"Responde al mensaje del usuario y escribe !ban"}); continue; }
            const objetivoEsAdmin = await esAdministrador(socket,chat,citado.participant);
            if (objetivoEsAdmin) { await socket.sendMessage(chat,{text:"⛔ No puedo banear a otro administrador."}); continue; }
            setLista(chat,citado.participant,"black",true);
            registrarAccion({groupId:chat,actorId:autor,targetId:citado.participant,action:"ban",reason:"ban permanente"});
            await expulsarConDelay(socket,chat,citado.participant,"ban permanente");
            continue;
          }

          if (comando === "!unban") {
            const citado = obtenerMensajeCitado(mensaje.message, chat);
            if (!citado) { await socket.sendMessage(chat,{text:"Responde a un mensaje antiguo del usuario y escribe !unban"}); continue; }
            setLista(chat,citado.participant,"black",false);
            registrarAccion({groupId:chat,actorId:autor,targetId:citado.participant,action:"unban"});
            await socket.sendMessage(chat,{text:`✅ Ban retirado a @${nombreVisible(citado.participant)}.`,mentions:[citado.participant]});
            continue;
          }

          /*
            EXPULSAR
          */

          if (comando === "!kick") {
            const citado =
              obtenerMensajeCitado(
                mensaje.message,
                chat
              );

            if (!citado) {
              await socket.sendMessage(chat, {
                text:
                  "Responde al mensaje del usuario y escribe !kick"
              });

              continue;
            }

            const objetivoEsAdmin =
              await esAdministrador(
                socket,
                chat,
                citado.participant
              );

            if (objetivoEsAdmin) {
              await socket.sendMessage(chat, {
                text:
                  "⛔ No puedo expulsar automáticamente a otro administrador."
              });

              continue;
            }

            try {
              await borrarMensaje(
                socket,
                chat,
                citado.key
              );
            } catch (error) {
              console.error(
                "⚠️ No se pudo borrar el mensaje citado:",
                error.message
              );
            }

            await expulsarConDelay(
              socket,
              chat,
              citado.participant,
              "expulsión ordenada por un administrador"
            );

            continue;
          }
        } catch (error) {
          console.error(
            "❌ Error procesando un mensaje:",
            error.message
          );
        }
      }
    }
  );
}

iniciarBot().catch((error) => {
  console.error(
    "❌ Error principal:",
    error
  );

  process.exit(1);
});
