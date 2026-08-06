import { getContentType } from "@whiskeysockets/baileys";

export function esperar(milisegundos) {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function obtenerJid(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return valor;

  if (typeof valor === "object") {
    const posiblesValores = [
      valor.id,
      valor.jid,
      valor.lid,
      valor.phoneNumber,
      valor.phoneNumberJid,
      valor.pn,
      valor.participant,
      valor.author
    ];

    for (const posible of posiblesValores) {
      if (typeof posible === "string" && posible.length > 0) return posible;
      if (posible && typeof posible === "object") {
        const jidInterno = obtenerJid(posible);
        if (jidInterno) return jidInterno;
      }
    }
  }

  return null;
}

export function normalizarParticipantes(participants) {
  if (!Array.isArray(participants)) return [];
  return participants.map(obtenerJid).filter((jid) => typeof jid === "string" && jid.length > 0);
}

export function nombreVisible(valor) {
  const jid = obtenerJid(valor);
  if (!jid || typeof jid !== "string") return "usuario";
  return jid.split("@")[0].replace(/:\d+$/, "");
}

export function horaMadrid() {
  return new Date().toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "medium"
  });
}

export function obtenerTexto(message) {
  if (!message) return "";
  const tipo = getContentType(message);

  switch (tipo) {
    case "conversation": return message.conversation ?? "";
    case "extendedTextMessage": return message.extendedTextMessage?.text ?? "";
    case "imageMessage": return message.imageMessage?.caption ?? "";
    case "videoMessage": return message.videoMessage?.caption ?? "";
    case "documentMessage": return message.documentMessage?.caption ?? "";
    case "buttonsResponseMessage": return message.buttonsResponseMessage?.selectedDisplayText ?? "";
    case "listResponseMessage": return message.listResponseMessage?.title ?? "";
    default: return "";
  }
}

export function obtenerContextoCitado(message) {
  return (
    message?.extendedTextMessage?.contextInfo ??
    message?.imageMessage?.contextInfo ??
    message?.videoMessage?.contextInfo ??
    message?.documentMessage?.contextInfo ??
    null
  );
}

export function obtenerMensajeCitado(message, chat) {
  const contexto = obtenerContextoCitado(message);
  const participante = obtenerJid(contexto?.participant);
  if (!participante || !contexto?.stanzaId) return null;

  return {
    participant: participante,
    key: {
      remoteJid: chat,
      id: contexto.stanzaId,
      participant: participante,
      fromMe: false
    }
  };
}

export function contieneEnlace(texto) {
  return /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/)/i.test(texto);
}

export function encontrarPalabraProhibida(texto, palabrasProhibidas) {
  const textoNormalizado = normalizarTexto(texto);
  return palabrasProhibidas.find((palabra) => {
    const palabraNormalizada = normalizarTexto(palabra);
    return palabraNormalizada.length > 0 && textoNormalizado.includes(palabraNormalizada);
  });
}
