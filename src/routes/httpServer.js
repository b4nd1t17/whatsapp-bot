import { crearDashboard } from "../dashboard/dashboardPage.js";
import express from "express";
import os from "node:os";
import { crearEstadoDashboard } from "../services/dashboardStats.js";

export function iniciarServidorHttp({
  port,
  panelToken,
  appVersion,
  inicioBot,
  informacionGruposPanel,
  obtenerEstadoConexion,
  actualizarDatosBot,
  cargarDatos,
  obtenerResumen,
  obtenerGruposPanel,
  actualizarAjusteGrupo,
  actualizarNumeroGrupo,
  obtenerLogsPanel,
  obtenerResumenAcciones,
  statsService
}) {
  const PORT = port;
  const PANEL_TOKEN = panelToken;
  const APP_VERSION = appVersion;
  const INICIO_BOT = inicioBot;

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

app.get("/dashboard", (req, res) => {
  if (!panelAutorizado(req)) {
    return res.status(401).send("Acceso denegado");
  }

  const html = crearDashboard({
    stats: {
      mensajes: 0,
      acciones: 0,
      usuarios: 0,
      grupos: 0
    },
    sistema: {
      online: true,
      uptime: "Activo",
      memoria: "Calculando",
      cpu: "Calculando",
      ultimoReinicio: new Date().toLocaleString()
    },
    actividad: []
  });

  res.send(html);
});
app.get("/admin", (req, res) => {
  if (!panelAutorizado(req)) {
    return res.status(401).send("Acceso denegado. Añade ?token=TU_CLAVE");
  }

  const grupos = obtenerGruposPanel();
  const resumen = obtenerResumen();
  const logsRecientes = obtenerLogsPanel(8);
  const token = String(req.query.token || PANEL_TOKEN);
  const estadoTexto = obtenerEstadoConexion() === "conectado" ? "Bot conectado" : "Conexión en curso";

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
    actualizarDatosBot(cargarDatos());
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
    actualizarDatosBot(cargarDatos());
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
    estadoConexion: obtenerEstadoConexion(),
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
    ok: obtenerEstadoConexion() === "conectado",
    estado: obtenerEstadoConexion(),
    servicio: "dogma-moderador",
    version: APP_VERSION,
    uptimeMs: Date.now() - INICIO_BOT,
    fecha: new Date().toISOString()
  });
});

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`);
  });

  return app;
}

