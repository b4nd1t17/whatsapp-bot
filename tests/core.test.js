import test from "node:test";
import assert from "node:assert/strict";
import { etiquetaRol, tieneNivel } from "../src/core/permissions.js";
import { nombreVisible, normalizarTexto, obtenerJid } from "../src/core/utils.js";
import { crearFiltrosContenido } from "../src/services/contentFilters.js";

test("normaliza texto y JID", () => {
  assert.equal(normalizarTexto("  ÁMÉN   Hermanos  "), "amen hermanos");
  assert.equal(obtenerJid({ participant: "34600111222@s.whatsapp.net" }), "34600111222@s.whatsapp.net");
  assert.equal(nombreVisible("34600111222:12@s.whatsapp.net"), "34600111222");
});

test("compara roles", () => {
  assert.equal(tieneNivel("admin", "moderador"), true);
  assert.equal(tieneNivel("usuario", "admin"), false);
  assert.equal(etiquetaRol("propietario"), "👑 Propietario");
});

test("detecta contenido excesivo", () => {
  const filtros = crearFiltrosContenido();
  assert.equal(filtros.demasiadasMayusculas("ESTE MENSAJE ESTÁ COMPLETAMENTE EN MAYÚSCULAS", 70), true);
  assert.equal(filtros.demasiadosEmojis("😂😂😂😂😂😂😂😂", 8), true);
  assert.equal(filtros.contieneBasuraRepetida("holaaaaaaaaaaaa"), true);
});
