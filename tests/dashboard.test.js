import test from "node:test";
import assert from "node:assert/strict";
import { crearEstadoDashboard, duracionHumana } from "../src/services/dashboardStats.js";

test("formatea el tiempo activo", () => {
  assert.equal(duracionHumana(65_000), "1 min 5 s");
  assert.equal(duracionHumana(3_600_000), "1 h 0 min");
});

test("crea métricas seguras para el dashboard", () => {
  const ahora = Date.now();
  const estado = crearEstadoDashboard({
    inicioBot: ahora - 60_000,
    resumen: { grupos: 2, avisosActivos: 3, acciones: 8 },
    acciones: { antispam: 2, antiflood: 1, delete: 4 },
    estadoConexion: "conectado",
    memoriaProceso: { rss: 100, heapUsed: 50, heapTotal: 200 },
    memoriaTotal: 1000,
    memoriaLibre: 400,
    carga1m: 1,
    cpus: 4,
    nodeVersion: "v26.6.0",
    version: "3.3.0"
  });
  assert.equal(estado.ok, true);
  assert.equal(estado.resumen.grupos, 2);
  assert.equal(estado.accionesProteccion, 7);
  assert.equal(estado.sistema.cargaPorcentaje, 25);
  assert.equal(estado.node, "26.6.0");
});
