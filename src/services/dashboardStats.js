function bytesHumanos(bytes) {
  const valor = Number(bytes || 0);
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 ** 2) return `${(valor / 1024).toFixed(1)} KB`;
  if (valor < 1024 ** 3) return `${(valor / 1024 ** 2).toFixed(1)} MB`;
  return `${(valor / 1024 ** 3).toFixed(1)} GB`;
}

function duracionHumana(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (dias) return `${dias} d ${horas} h`;
  if (horas) return `${horas} h ${minutos} min`;
  if (minutos) return `${minutos} min ${segundos} s`;
  return `${segundos} s`;
}

export function crearEstadoDashboard({
  inicioBot,
  resumen,
  acciones,
  estadoConexion,
  memoriaProceso,
  memoriaTotal,
  memoriaLibre,
  carga1m,
  cpus,
  nodeVersion,
  version
}) {
  const total = Math.max(1, Number(memoriaTotal || 1));
  const libre = Math.max(0, Number(memoriaLibre || 0));
  const rss = Math.max(0, Number(memoriaProceso?.rss || 0));
  const heapUsado = Math.max(0, Number(memoriaProceso?.heapUsed || 0));
  const heapTotal = Math.max(1, Number(memoriaProceso?.heapTotal || 1));
  const numeroCpus = Math.max(1, Number(cpus || 1));
  const carga = Math.max(0, Number(carga1m || 0));
  const cargaPorcentaje = Math.min(100, (carga / numeroCpus) * 100);
  const proteccion = Number(acciones?.antispam || 0) + Number(acciones?.antiflood || 0) + Number(acciones?.delete || 0);

  return {
    ok: estadoConexion === "conectado",
    estado: estadoConexion,
    version,
    node: String(nodeVersion || "").replace(/^v/, ""),
    uptimeMs: Date.now() - Number(inicioBot || Date.now()),
    uptimeTexto: duracionHumana(Date.now() - Number(inicioBot || Date.now())),
    resumen: {
      grupos: Number(resumen?.grupos || 0),
      avisosActivos: Number(resumen?.avisosActivos || 0),
      acciones: Number(resumen?.acciones || 0)
    },
    accionesProteccion: proteccion,
    memoria: {
      rss,
      rssTexto: bytesHumanos(rss),
      heapTexto: `${bytesHumanos(heapUsado)} / ${bytesHumanos(heapTotal)} heap`,
      porcentajeSistema: Math.min(100, (rss / total) * 100)
    },
    sistema: {
      cpus: numeroCpus,
      carga1m: carga,
      cargaTexto: carga.toFixed(2),
      cargaPorcentaje,
      ramLibre: libre,
      ramLibreTexto: bytesHumanos(libre)
    }
  };
}

export { bytesHumanos, duracionHumana };
