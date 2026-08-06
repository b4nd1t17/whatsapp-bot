/**
 * Página principal del Dashboard
 * Dogma Moderador 4.0
 */

import { crearTarjetasEstadisticas } from "./components/statsCards.js";
import { crearEstadoSistema } from "./components/systemStatus.js";
import { crearActividadReciente } from "./components/activityFeed.js";


export function crearDashboard(datos = {}) {

  const {
    stats = {},
    sistema = {},
    actividad = []
  } = datos;


  return `
<!DOCTYPE html>
<html lang="es">

<head>
<meta charset="UTF-8">
<title>Dogma Moderador 4.0</title>
</head>

<body>

<div class="dashboard">

<header class="dashboard-header">
  <h1>🛡️ Dogma Moderador</h1>
  <span>Versión 4.0 DEV</span>
</header>


<section>
${crearTarjetasEstadisticas(stats)}
</section>


<section>
${crearEstadoSistema(sistema)}
</section>


<section>
${crearActividadReciente(actividad)}
</section>


</div>

</body>

</html>
`;
}
