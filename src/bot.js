import "dotenv/config";
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
import { statsService } from "./services/statsService.js";
import { iniciarServidorHttp } from "./routes/httpServer.js";

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

iniciarServidorHttp({
  port: PORT,
  panelToken: PANEL_TOKEN,
  appVersion: APP_VERSION,
  inicioBot: INICIO_BOT,
  informacionGruposPanel,
  obtenerEstadoConexion: () => estadoConexionPanel,
  actualizarDatosBot: (nuevosDatos) => { datosBot = nuevosDatos; },
  cargarDatos,
  obtenerResumen,
  obtenerGruposPanel,
  actualizarAjusteGrupo,
  actualizarNumeroGrupo,
  obtenerLogsPanel,
  obtenerResumenAcciones,
  statsService
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
