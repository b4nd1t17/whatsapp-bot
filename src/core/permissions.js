const NIVEL_ROL = Object.freeze({
  usuario: 0,
  moderador: 1,
  admin: 2,
  superadmin: 3,
  propietario: 4
});

const ETIQUETAS = Object.freeze({
  propietario: "👑 Propietario",
  superadmin: "🛡 SuperAdmin",
  admin: "👮 Admin",
  moderador: "🔨 Moderador",
  usuario: "👤 Usuario"
});

export function tieneNivel(rol, minimo) {
  return (NIVEL_ROL[rol] ?? 0) >= (NIVEL_ROL[minimo] ?? 0);
}

export function etiquetaRol(rol) {
  return ETIQUETAS[rol] ?? rol;
}

export function crearServicioPermisos({ ownerJids, obtenerRolGuardado, esAdministrador }) {
  const propietarios = ownerJids instanceof Set ? ownerJids : new Set(ownerJids ?? []);

  function esPropietarioBot(jid) {
    return Boolean(jid && propietarios.has(jid));
  }

  async function obtenerRolEfectivo(socket, grupoId, usuarioId, esAdminWhatsApp = null) {
    if (esPropietarioBot(usuarioId)) return "propietario";

    const guardado = obtenerRolGuardado(grupoId, usuarioId);
    if (guardado) return guardado;

    const adminWhatsApp = esAdminWhatsApp ?? await esAdministrador(socket, grupoId, usuarioId);
    return adminWhatsApp ? "admin" : "usuario";
  }

  return { esPropietarioBot, obtenerRolEfectivo };
}

export { NIVEL_ROL };
