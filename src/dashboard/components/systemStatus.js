/**
 * Estado del sistema
 * Dogma Moderador 4.0
 */

export function crearEstadoSistema(datos = {}) {
  const {
    online = false,
    uptime = "0m",
    memoria = "0 MB",
    cpu = "0%",
    ultimoReinicio = "-"
  } = datos;

  const estado = online ? "🟢 ONLINE" : "🔴 OFFLINE";

  return `
    <div class="system-status-card">

      <div class="system-header">
        <h3>Estado del Bot</h3>
        <span>${estado}</span>
      </div>

      <div class="system-data">

        <div class="system-item">
          <span>⏱️ Uptime</span>
          <strong>${uptime}</strong>
        </div>

        <div class="system-item">
          <span>💾 Memoria</span>
          <strong>${memoria}</strong>
        </div>

        <div class="system-item">
          <span>⚙️ CPU</span>
          <strong>${cpu}</strong>
        </div>

        <div class="system-item">
          <span>🔄 Reinicio</span>
          <strong>${ultimoReinicio}</strong>
        </div>

      </div>

    </div>
  `;
}
