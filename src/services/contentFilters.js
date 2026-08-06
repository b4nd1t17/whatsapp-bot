import { normalizarTexto } from "../core/utils.js";

export function crearFiltrosContenido() {
  const actividadUsuarios = new Map();
  const repeticionUsuarios = new Map();

  function demasiadasMayusculas(texto, porcentaje = 70) {
    const letras = [...String(texto ?? "")].filter((c) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(c));
    if (letras.length < 10) return false;
    const mayusculas = letras.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    return mayusculas / letras.length >= Number(porcentaje) / 100;
  }

  function demasiadosEmojis(texto, limite = 8) {
    return [...String(texto ?? "").matchAll(/\p{Extended_Pictographic}/gu)].length >= Number(limite);
  }

  function contieneBasuraRepetida(texto) {
    const limpio = String(texto ?? "").trim();
    if (limpio.length < 8) return false;
    return /(.)\1{9,}/u.test(limpio) || /([!?¡¿.*_=-])\1{7,}/u.test(limpio);
  }

  function detectarFlood(grupo, usuario) {
    const key = `${grupo}:${usuario}`;
    const ahora = Date.now();
    const actividad = (actividadUsuarios.get(key) ?? []).filter((momento) => ahora - momento < 10_000);
    actividad.push(ahora);
    actividadUsuarios.set(key, actividad);
    return actividad.length >= 6;
  }

  function detectarRepeticion(grupo, usuario, texto) {
    const key = `${grupo}:${usuario}`;
    const ahora = Date.now();
    const normalizado = normalizarTexto(texto);
    if (!normalizado || normalizado.startsWith("!")) return false;

    const anterior = repeticionUsuarios.get(key) ?? { texto: "", veces: 0, tiempo: 0 };
    const siguiente = anterior.texto === normalizado && ahora - anterior.tiempo < 30_000
      ? { texto: normalizado, veces: anterior.veces + 1, tiempo: ahora }
      : { texto: normalizado, veces: 1, tiempo: ahora };

    repeticionUsuarios.set(key, siguiente);
    return siguiente.veces >= 3;
  }

  return {
    demasiadasMayusculas,
    demasiadosEmojis,
    contieneBasuraRepetida,
    detectarFlood,
    detectarRepeticion
  };
}
