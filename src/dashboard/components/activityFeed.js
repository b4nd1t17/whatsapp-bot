/**
 * Feed de actividad reciente
 * Dogma Moderador 4.0
 */

export function crearActividadReciente(actividades = []) {

  if (!actividades.length) {
    return `
      <div class="activity-card">
        <h3>📜 Actividad reciente</h3>
        <p>No hay actividad registrada</p>
      </div>
    `;
  }

  const lista = actividades.map(item => `
    <div class="activity-item">
      <span>${item.icono || "⚙️"}</span>
      <div>
        <strong>${item.titulo}</strong>
        <small>${item.fecha}</small>
      </div>
    </div>
  `).join("");

  return `
    <div class="activity-card">
      <h3>📜 Actividad reciente</h3>
      <div class="activity-list">
        ${lista}
      </div>
    </div>
  `;
}
