/**
 * Feed de actividad reciente
 * Dogma Moderador 4.0
 */

function formatoAccion(action) {

  const acciones = {
    ban: {
      icono: "🔨",
      titulo: "Usuario expulsado"
    },

    kick: {
      icono: "🚪",
      titulo: "Usuario echado"
    },

    warn: {
      icono: "⚠️",
      titulo: "Advertencia enviada"
    },

    delete: {
      icono: "🗑️",
      titulo: "Mensaje eliminado"
    },

    antispam: {
      icono: "🚫",
      titulo: "Spam bloqueado"
    },

    antiflood: {
      icono: "🌊",
      titulo: "Flood bloqueado"
    },

    mute: {
      icono: "🔇",
      titulo: "Usuario silenciado"
    }
  };

  return acciones[action] || {
    icono: "⚙️",
    titulo: action || "Acción"
  };
}


export function crearActividadReciente(actividades = []) {

  if (!actividades.length) {
    return `
      <div class="activity-card">
        <h3>📜 Actividad reciente</h3>
        <p>No hay actividad registrada</p>
      </div>
    `;
  }


  const lista = actividades.map(item => {

    const info = formatoAccion(item.action);

    return `
      <div class="activity-item">

        <span class="activity-icon">
          ${item.icono || info.icono}
        </span>

        <div>
          <strong>
            ${item.titulo || info.titulo}
          </strong>

          <small>
            ${item.fecha || ""}
          </small>

        </div>

      </div>
    `;

  }).join("");


  return `
    <div class="activity-card">

      <h3>📜 Actividad reciente</h3>

      <div class="activity-list">
        ${lista}
      </div>

    </div>
  `;
}
