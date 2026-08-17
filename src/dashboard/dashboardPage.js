/**
 * Dashboard PRO
 * Dogma Moderador 4.0
 */

import { crearTarjetasEstadisticas } from "./components/statsCards.js";
import { crearEstadoSistema } from "./components/systemStatus.js";
import { crearActividadReciente } from "./components/activityFeed.js";
import { crearUsuariosBloqueados } from "./components/blockedUsers.js";

export function crearDashboard(datos = {}) {

  const {
    stats = {},
    sistema = {},
    actividad = [],
 bloqueados = [],
  token = ""
  } = datos;


  return `
<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Dogma Moderador 4.0</title>

<style>

:root {
  --bg:#080b12;
  --panel:#111827;
  --panel2:#1f2937;
  --text:#f9fafb;
  --muted:#9ca3af;
  --accent:#7c3aed;
  --green:#22c55e;
  --red:#ef4444;
}


* {
 box-sizing:border-box;
}


body {

 margin:0;
 min-height:100vh;

 background:
 radial-gradient(circle at top,#1e293b,#020617);

 color:var(--text);

 font-family:
 Inter,
 system-ui,
 Arial,
 sans-serif;

}


.dashboard {

 max-width:1400px;
 margin:auto;
 padding:35px;

}


.header {

 display:flex;
 justify-content:space-between;
 align-items:center;

 margin-bottom:30px;

}


.header h1 {

 margin:0;
 font-size:32px;

}


.version {

 color:var(--muted);

}


.grid {

 display:grid;

 grid-template-columns:
 repeat(auto-fit,minmax(250px,1fr));

 gap:20px;

}


.card {

 background:
 linear-gradient(
 145deg,
 var(--panel),
 var(--panel2)
 );

 border-radius:20px;

 padding:25px;

 border:1px solid #334155;

 box-shadow:
 0 20px 40px rgba(0,0,0,.3);

}


.section {

 margin-top:25px;

}


.status {

 display:inline-flex;

 padding:10px 18px;

 border-radius:999px;

 background:#052e16;

 color:#86efac;

 font-weight:bold;

}


.footer {

 margin-top:40px;

 color:var(--muted);

 text-align:center;

 font-size:13px;

}


.stats-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:20px;
}


.stat-card {
  background:
  linear-gradient(145deg,var(--panel),var(--panel2));

  border-radius:20px;
  padding:22px;

  border:1px solid #334155;

  display:flex;
  align-items:center;
  gap:18px;

  box-shadow:
  0 15px 35px rgba(0,0,0,.25);
}


.stat-icon {
  font-size:38px;
}


.stat-info span {
  color:var(--muted);
  font-size:14px;
}


.stat-info strong {
  display:block;
  font-size:32px;
  margin-top:5px;
}



.system-status-card {
  background:
  linear-gradient(145deg,var(--panel),var(--panel2));

  border-radius:20px;
  padding:25px;
}


.system-header {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:20px;
}


.system-data {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:15px;
}


.system-item {
  background:#0f172a;
  padding:15px;
  border-radius:14px;
}


.system-item span {
  color:var(--muted);
  display:block;
  font-size:13px;
}


.system-item strong {
  display:block;
  margin-top:8px;
  font-size:20px;
}



.activity-card {
  background:
  linear-gradient(145deg,var(--panel),var(--panel2));

  border-radius:20px;
  padding:25px;
}


.activity-item {
  display:flex;
  gap:15px;
  padding:12px 0;
  border-bottom:1px solid #334155;
}


.activity-item small {
  color:var(--muted);
}
</style>

</head>


<body>


<div class="dashboard">


<div class="header">

<div>

<h1>🛡️ Dogma Moderador</h1>

<div class="version">
Panel de control 4.0
</div>

</div>


<div class="status">
🟢 ONLINE
</div>


</div>


<div class="grid">

${crearTarjetasEstadisticas(stats)}

</div>


<div class="section card">

${crearEstadoSistema(sistema)}

</div>


<div class="section card">

${crearActividadReciente(actividad)}

</div>


<div class="section card">



${crearUsuariosBloqueados(bloqueados, token)}

</div>


<div class="footer">

Dogma Moderador 4.0 · Panel protegido

</div>


</div>


</body>

</html>
`;

}
