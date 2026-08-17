/**
 * Usuarios bloqueados
 * Dogma Moderador 4.0
 */

export function crearUsuariosBloqueados(lista = [], token = "") {

const filas = lista.length
? lista.map(item => `
<div class="activity-item">

<span class="activity-icon">
🚫
</span>

<div style="flex:1">
<strong>${item.user_id}</strong>

<small>
Grupo: ${item.group_id}<br>
Fecha: ${item.created_at}
</small>

</div>

<button onclick='desbloquearUsuario(${JSON.stringify(item.group_id)}, ${JSON.stringify(item.user_id)})'>
🟢 Desbloquear
</button>

</div>
`).join("")
: "<p>No hay usuarios bloqueados.</p>";

return `

<h3>🚫 Usuarios bloqueados</h3>

<div class="activity-list">

${filas}

</div>


<script>

const panelToken = "${token}";

async function desbloquearUsuario(groupId,userId){

await fetch("/api/desbloquear?token=" + panelToken,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
groupId,
userId
})
});

location.reload();

}

</script>

`;
}
