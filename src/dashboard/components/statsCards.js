/**
 * Generador de tarjetas de estadísticas
 * Dogma Moderador 4.0
 */

export function crearTarjetasEstadisticas(stats = {}) {
  const {
    mensajes = 0,
    acciones = 0,
    usuarios = 0,
    grupos = 0
  } = stats;

  return `
    <div class="stats-grid">

      <div class="stat-card">
        <div class="stat-icon">📨</div>
        <div class="stat-info">
          <span>Mensajes</span>
          <strong>${mensajes}</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">🛡️</div>
        <div class="stat-info">
          <span>Moderaciones</span>
          <strong>${acciones}</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <span>Usuarios</span>
          <strong>${usuarios}</strong>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">💬</div>
        <div class="stat-info">
          <span>Grupos</span>
          <strong>${grupos}</strong>
        </div>
      </div>

    </div>
  `;
}
