import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = path.resolve("./data");
const DB_PATH = path.join(DATA_DIR, "dogma-moderador.sqlite");
const LEGACY_JSON = path.resolve("./bot-data.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS group_settings (
    group_id TEXT PRIMARY KEY,
    antilink INTEGER NOT NULL DEFAULT 0,
    bienvenida INTEGER NOT NULL DEFAULT 1,
    filtro_palabras INTEGER NOT NULL DEFAULT 1,
    antispam INTEGER NOT NULL DEFAULT 1,
    antiflood INTEGER NOT NULL DEFAULT 1,
    antimayusculas INTEGER NOT NULL DEFAULT 0,
    antiemojis INTEGER NOT NULL DEFAULT 0,
    antibasura INTEGER NOT NULL DEFAULT 0,
    limite_emojis INTEGER NOT NULL DEFAULT 8,
    porcentaje_mayusculas INTEGER NOT NULL DEFAULT 70,
    palabras_prohibidas TEXT NOT NULL DEFAULT '[]',
    avisos TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS moderation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    actor_id TEXT,
    target_id TEXT,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS muted_users (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    actor_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS bot_roles (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('usuario','moderador','admin','superadmin')),
    assigned_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS access_list (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('white','black')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(group_id, user_id, list_type)
  );
`);

function ensureColumn(name, sql) {
  const cols = db.prepare("PRAGMA table_info(group_settings)").all().map(r => r.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE group_settings ADD COLUMN ${sql}`);
}
ensureColumn("antispam", "antispam INTEGER NOT NULL DEFAULT 1");
ensureColumn("antiflood", "antiflood INTEGER NOT NULL DEFAULT 1");
ensureColumn("antimayusculas", "antimayusculas INTEGER NOT NULL DEFAULT 0");
ensureColumn("antiemojis", "antiemojis INTEGER NOT NULL DEFAULT 0");
ensureColumn("antibasura", "antibasura INTEGER NOT NULL DEFAULT 0");
ensureColumn("limite_emojis", "limite_emojis INTEGER NOT NULL DEFAULT 8");
ensureColumn("porcentaje_mayusculas", "porcentaje_mayusculas INTEGER NOT NULL DEFAULT 70");

const selectGroups = db.prepare(`SELECT * FROM group_settings`);
const upsertGroup = db.prepare(`
  INSERT INTO group_settings (
    group_id, antilink, bienvenida, filtro_palabras, antispam, antiflood,
    antimayusculas, antiemojis, antibasura, limite_emojis, porcentaje_mayusculas, palabras_prohibidas, avisos, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(group_id) DO UPDATE SET
    antilink=excluded.antilink, bienvenida=excluded.bienvenida,
    filtro_palabras=excluded.filtro_palabras, antispam=excluded.antispam,
    antiflood=excluded.antiflood, antimayusculas=excluded.antimayusculas,
    antiemojis=excluded.antiemojis, antibasura=excluded.antibasura,
    limite_emojis=excluded.limite_emojis, porcentaje_mayusculas=excluded.porcentaje_mayusculas, palabras_prohibidas=excluded.palabras_prohibidas,
    avisos=excluded.avisos, updated_at=CURRENT_TIMESTAMP
`);
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

export function cargarDatos() {
  const grupos = {};
  for (const row of selectGroups.all()) {
    grupos[row.group_id] = {
      antilink: Boolean(row.antilink), bienvenida: Boolean(row.bienvenida),
      filtroPalabras: Boolean(row.filtro_palabras), antispam: Boolean(row.antispam),
      antiflood: Boolean(row.antiflood), antimayusculas: Boolean(row.antimayusculas),
      antiemojis: Boolean(row.antiemojis), antibasura: Boolean(row.antibasura),
      limiteEmojis: Number(row.limite_emojis || 8), porcentajeMayusculas: Number(row.porcentaje_mayusculas || 70),
      palabrasProhibidas: parseJson(row.palabras_prohibidas, []),
      avisos: parseJson(row.avisos, {})
    };
  }
  return { grupos };
}

export function guardarDatos(datosBot) {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [groupId, c] of Object.entries(datosBot.grupos ?? {})) {
      upsertGroup.run(groupId, c.antilink?1:0, c.bienvenida?1:0, c.filtroPalabras?1:0,
        c.antispam!==false?1:0, c.antiflood!==false?1:0, c.antimayusculas?1:0,
        c.antiemojis?1:0, c.antibasura?1:0, Number(c.limiteEmojis||8), Number(c.porcentajeMayusculas||70),
        JSON.stringify(c.palabrasProhibidas??[]), JSON.stringify(c.avisos??{}));
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export function migrarJsonSiExiste() {
  const total = db.prepare("SELECT COUNT(*) AS total FROM group_settings").get().total;
  if (total > 0 || !fs.existsSync(LEGACY_JSON)) return false;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf8"));
    guardarDatos(legacy); fs.renameSync(LEGACY_JSON, `${LEGACY_JSON}.migrado`);
    console.log("✅ bot-data.json migrado a SQLite."); return true;
  } catch (e) { console.error("⚠️ No se pudo migrar bot-data.json:", e.message); return false; }
}

export function obtenerResumen() {
  const grupos = db.prepare("SELECT COUNT(*) AS total FROM group_settings").get().total;
  let avisosActivos = 0;
  for (const row of db.prepare("SELECT avisos FROM group_settings").all()) {
    avisosActivos += Object.values(parseJson(row.avisos, {})).reduce((s,v)=>s+Number(v||0),0);
  }
  const acciones = db.prepare("SELECT COUNT(*) AS total FROM moderation_log").get().total;
  return { grupos, avisosActivos, acciones };
}
export function registrarAccion({groupId, actorId=null, targetId=null, action, reason=null}) {
  db.prepare(`INSERT INTO moderation_log(group_id,actor_id,target_id,action,reason) VALUES(?,?,?,?,?)`)
    .run(groupId, actorId, targetId, action, reason);
}
export function setLista(groupId,userId,type,enabled=true) {
  if (enabled) db.prepare(`INSERT OR IGNORE INTO access_list(group_id,user_id,list_type) VALUES(?,?,?)`).run(groupId,userId,type);
  else db.prepare(`DELETE FROM access_list WHERE group_id=? AND user_id=? AND list_type=?`).run(groupId,userId,type);
}
export function estaEnLista(groupId,userId,type) {
  return Boolean(db.prepare(`SELECT 1 FROM access_list WHERE group_id=? AND user_id=? AND list_type=?`).get(groupId,userId,type));
}
export function listar(groupId,type) {
  return db.prepare(`SELECT user_id FROM access_list WHERE group_id=? AND list_type=? ORDER BY created_at`).all(groupId,type).map(r=>r.user_id);
}
export function cerrarBaseDeDatos(){ db.close(); }
migrarJsonSiExiste();


export function silenciarUsuario(groupId, userId, expiresAt, actorId=null) {
  db.prepare(`
    INSERT INTO muted_users(group_id,user_id,expires_at,actor_id) VALUES(?,?,?,?)
    ON CONFLICT(group_id,user_id) DO UPDATE SET
      expires_at=excluded.expires_at, actor_id=excluded.actor_id, created_at=CURRENT_TIMESTAMP
  `).run(groupId,userId,expiresAt,actorId);
}

export function quitarSilencio(groupId, userId) {
  db.prepare(`DELETE FROM muted_users WHERE group_id=? AND user_id=?`).run(groupId,userId);
}

export function obtenerSilencio(groupId, userId) {
  const row=db.prepare(`SELECT expires_at,actor_id FROM muted_users WHERE group_id=? AND user_id=?`).get(groupId,userId);
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    quitarSilencio(groupId,userId);
    return null;
  }
  return { expiresAt:Number(row.expires_at), actorId:row.actor_id };
}

export function obtenerGruposPanel() {
  return selectGroups.all().map(row => ({
    groupId: row.group_id,
    antilink:Boolean(row.antilink), bienvenida:Boolean(row.bienvenida),
    filtroPalabras:Boolean(row.filtro_palabras), antispam:Boolean(row.antispam),
    antiflood:Boolean(row.antiflood), antimayusculas:Boolean(row.antimayusculas),
    antiemojis:Boolean(row.antiemojis), antibasura:Boolean(row.antibasura),
    limiteEmojis:Number(row.limite_emojis||8), porcentajeMayusculas:Number(row.porcentaje_mayusculas||70)
  }));
}

export function actualizarAjusteGrupo(groupId, campo, valor) {
  const permitidos={
    antilink:'antilink', bienvenida:'bienvenida', filtroPalabras:'filtro_palabras',
    antispam:'antispam', antiflood:'antiflood', antimayusculas:'antimayusculas',
    antiemojis:'antiemojis', antibasura:'antibasura'
  };
  const columna=permitidos[campo];
  if (!columna) throw new Error('Ajuste no permitido');
  db.prepare(`INSERT OR IGNORE INTO group_settings(group_id) VALUES(?)`).run(groupId);
  db.prepare(`UPDATE group_settings SET ${columna}=?, updated_at=CURRENT_TIMESTAMP WHERE group_id=?`).run(valor?1:0,groupId);
}

export function obtenerLogsPanel(limite=100) {
  const safe=Math.max(1,Math.min(500,Number(limite)||100));
  return db.prepare(`SELECT id,group_id,actor_id,target_id,action,reason,created_at FROM moderation_log ORDER BY id DESC LIMIT ?`).all(safe);
}


export function actualizarNumeroGrupo(groupId, campo, valor) {
  const permitidos={ limiteEmojis:'limite_emojis', porcentajeMayusculas:'porcentaje_mayusculas' };
  const columna=permitidos[campo];
  if (!columna) throw new Error('Ajuste numérico no permitido');
  const numero=Number(valor);
  if (!Number.isFinite(numero)) throw new Error('Valor inválido');
  const limites = campo === 'limiteEmojis' ? [1, 100] : [20, 100];
  if (numero < limites[0] || numero > limites[1]) throw new Error(`El valor debe estar entre ${limites[0]} y ${limites[1]}`);
  db.prepare(`INSERT OR IGNORE INTO group_settings(group_id) VALUES(?)`).run(groupId);
  db.prepare(`UPDATE group_settings SET ${columna}=?, updated_at=CURRENT_TIMESTAMP WHERE group_id=?`).run(Math.round(numero),groupId);
}


const ROLES_VALIDOS = new Set(["usuario", "moderador", "admin", "superadmin"]);

export function asignarRol(groupId, userId, role, assignedBy = null) {
  if (!ROLES_VALIDOS.has(role)) throw new Error("Rol no válido");
  if (role === "usuario") {
    db.prepare(`DELETE FROM bot_roles WHERE group_id=? AND user_id=?`).run(groupId, userId);
    return;
  }
  db.prepare(`
    INSERT INTO bot_roles(group_id,user_id,role,assigned_by) VALUES(?,?,?,?)
    ON CONFLICT(group_id,user_id) DO UPDATE SET
      role=excluded.role, assigned_by=excluded.assigned_by, updated_at=CURRENT_TIMESTAMP
  `).run(groupId, userId, role, assignedBy);
}

export function obtenerRolGuardado(groupId, userId) {
  return db.prepare(`SELECT role FROM bot_roles WHERE group_id=? AND user_id=?`).get(groupId, userId)?.role ?? null;
}

export function listarRoles(groupId) {
  return db.prepare(`SELECT user_id,role,assigned_by,updated_at FROM bot_roles WHERE group_id=? ORDER BY CASE role WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 WHEN 'moderador' THEN 3 ELSE 4 END, updated_at DESC`).all(groupId);
}
