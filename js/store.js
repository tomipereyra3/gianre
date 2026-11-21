// Datos: se guardan en el dispositivo (funciona sin señal) y se sincronizan con la nube.

const KEY = 'gianre:v1';

export const ESTADOS = [
  ['urgente', 'Urgente'],
  ['pronto', 'Pronto'],
  ['bien', 'Bien'],
];
export const ESTADO_LABEL = Object.fromEntries(ESTADOS);

// Lo nuevo entra como "Pronto"; un toque lo pasa a Urgente, otro a Bien.
export const ESTADO_INICIAL = 'pronto';
export const SIGUIENTE = { pronto: 'urgente', urgente: 'bien', bien: 'pronto' };

// Respeta cómo ya escriben en WhatsApp: ❌📌❗⚠️🔴 = Urgente, ✅✔️🟢 = Bien.
const MARCA_URGENTE = /❌|\u{1F4CC}|❗|‼️?|⚠️?|\u{1F534}/gu;
const MARCA_BIEN = /✅|✔️?|\u{1F7E2}/gu;
export function interpretarLinea(linea) {
  const urgente = !!linea.match(MARCA_URGENTE);
  const bien = !!linea.match(MARCA_BIEN);
  const texto = linea.replace(MARCA_URGENTE, '').replace(MARCA_BIEN, '').replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim();
  return { texto, estado: urgente ? 'urgente' : bien ? 'bien' : ESTADO_INICIAL };
}

// Las patentes siempre tienen números; los nombres, casi nunca.
export const parecePatente = (s) => /\d/.test(s || '');

const blank = () => ({ taller: null, clientes: [], autos: [], diagnosticos: [] });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw ? { ...blank(), ...raw } : blank();
  } catch {
    return blank();
  }
}

export const db = load();

// ---------- Sincronización: qué cambió desde la última vez
// Cada registro lleva "act" (cuándo cambió). En vez de tocar cada pantalla,
// al guardar se compara cada registro con su última versión conocida.

const TIPOS = ['clientes', 'autos', 'diagnosticos'];
const KEY_SYNC = 'gianre:sync';

function cargarMeta() {
  try {
    return { clave: null, version: 0, sucios: {}, borrados: {}, ...JSON.parse(localStorage.getItem(KEY_SYNC) || '{}') };
  } catch {
    return { clave: null, version: 0, sucios: {}, borrados: {} };
  }
}
const meta = cargarMeta();
export const sync = meta;
export function guardarMeta() {
  try {
    localStorage.setItem(KEY_SYNC, JSON.stringify(meta));
  } catch {}
}

const firma = (r) => JSON.stringify(r, (k, v) => (k === 'act' ? undefined : v));
const firmas = new Map();
function registros() {
  const out = [];
  if (db.taller) out.push(['taller:taller', db.taller]);
  for (const t of TIPOS) for (const r of db[t]) out.push([`${t}:${r.id}`, r]);
  return out;
}
for (const [k, r] of registros()) firmas.set(k, firma(r));

function marcarCambios() {
  const ahora = Date.now();
  const vistos = new Set();
  let hubo = false;
  for (const [k, r] of registros()) {
    vistos.add(k);
    const f = firma(r);
    if (firmas.get(k) !== f) {
      r.act = Math.max(ahora, (r.act || 0) + 1);
      firmas.set(k, f);
      meta.sucios[k] = 1;
      delete meta.borrados[k];
      hubo = true;
    }
  }
  for (const k of [...firmas.keys()]) {
    if (!vistos.has(k)) {
      firmas.delete(k);
      meta.borrados[k] = ahora;
      meta.sucios[k] = 1;
      hubo = true;
    }
  }
  if (hubo) guardarMeta();
  return hubo;
}

let alGuardar = null;
export const cuandoSeGuarde = (fn) => (alGuardar = fn);

export function save() {
  const hubo = marcarCambios();
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    return false;
  }
  if (hubo) alGuardar?.();
  return true;
}

// Todo lo local pasa a "para subir" (al crear el taller en la nube o al vincular).
export function marcarTodo({ menosTaller = false } = {}) {
  for (const [k, r] of registros()) {
    if (menosTaller && k === 'taller:taller') continue;
    r.act = r.act || Date.now();
    meta.sucios[k] = 1;
  }
  guardarMeta();
}

export function paraSubir() {
  const cambios = [];
  const enviados = {};
  const mapa = new Map(registros());
  for (const k of Object.keys(meta.sucios)) {
    const [tipo, id] = k.split(':');
    const r = mapa.get(k);
    if (r) {
      // Un diagnóstico vacío todavía no es nada: se sube cuando tenga algo.
      if (tipo === 'diagnosticos' && vacio(r)) continue;
      cambios.push({ tipo, id, act: r.act, datos: r });
      enviados[k] = r.act;
    } else if (meta.borrados[k]) {
      cambios.push({ tipo, id, act: meta.borrados[k], borrado: true });
      enviados[k] = meta.borrados[k];
    } else delete meta.sucios[k];
  }
  return { cambios, enviados };
}

// Limpia lo que ya subió, salvo que haya vuelto a cambiar mientras tanto.
export function subidos(enviados) {
  const mapa = new Map(registros());
  for (const [k, act] of Object.entries(enviados)) {
    const ahora = mapa.get(k)?.act ?? meta.borrados[k];
    if (ahora === act) delete meta.sucios[k];
  }
  guardarMeta();
}

// Trae lo que cambió en otros dispositivos. Gana lo más nuevo.
export function aplicarRemotos(cambios = []) {
  let hubo = false;
  for (const c of cambios) {
    const k = `${c.tipo}:${c.id}`;
    if (c.tipo === 'taller') {
      if (!c.borrado && (!db.taller || (db.taller.act || 0) < c.act)) {
        db.taller = { ...c.datos, act: c.act };
        firmas.set(k, firma(db.taller));
        delete meta.sucios[k];
        hubo = true;
      }
      continue;
    }
    if (!TIPOS.includes(c.tipo)) continue;
    const lista = db[c.tipo];
    const i = lista.findIndex((r) => r.id === c.id);
    const local = lista[i];
    if (c.borrado) {
      if (local && (local.act || 0) < c.act) {
        lista.splice(i, 1);
        firmas.delete(k);
        delete meta.sucios[k];
        meta.borrados[k] = c.act;
        hubo = true;
      }
      continue;
    }
    if (local) {
      if ((local.act || 0) >= c.act) continue;
      // Mismo objeto: si una pantalla lo tiene abierto, ve el cambio.
      for (const key of Object.keys(local)) delete local[key];
      Object.assign(local, c.datos, { act: c.act });
      firmas.set(k, firma(local));
    } else {
      if ((meta.borrados[k] || 0) >= c.act) continue;
      const nuevo = { ...c.datos, act: c.act };
      lista.push(nuevo);
      firmas.set(k, firma(nuevo));
    }
    delete meta.sucios[k];
    hubo = true;
  }
  if (hubo) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  }
  guardarMeta();
  return hubo;
}

export const snapshot = () => JSON.stringify(db);

export function restore(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const b = blank();
  for (const k in b) db[k] = data[k] ?? b[k];
  save();
}

export const esCopiaValida = (d) =>
  !!d && Array.isArray(d.autos) && Array.isArray(d.clientes) && Array.isArray(d.diagnosticos);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Formatos

export const fold = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const normPatente = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function fmtPatente(p) {
  p = normPatente(p);
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
  if (/^[A-Z]{3}\d{3}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3)}`;
  return p;
}

// Patentes viejas (ABC 123): fondo negro. Mercosur: blanca con franja azul.
export const esPatenteVieja = (p) => /^[A-Z]{3}\d{3}$/.test(normPatente(p));

export const fmtKm = (n) => (n ? Number(n).toLocaleString('es-AR') : '');

const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function fmtFecha(ts, conAnio = false) {
  const d = new Date(ts);
  const mismoAnio = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    ...(conAnio || !mismoAnio ? { year: 'numeric' } : {}),
  })
    .format(d)
    .replace(/\./g, '')
    .replace(/ de /g, ' ');
}

export const fmtFechaLarga = (ts) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));

export function hace(ts) {
  const dia = (t) => new Date(t).setHours(0, 0, 0, 0);
  const dias = Math.round((dia(Date.now()) - dia(ts)) / 864e5);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fmtFecha(ts);
}

// Número para wa.me. Asume Argentina si no tiene código de país:
// saca el 0 y el 15, y agrega 549.
export function waNumber(tel) {
  if (!tel) return '';
  const intl = tel.trim().startsWith('+');
  let d = tel.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  if (intl || (d.startsWith('54') && d.length >= 12)) {
    if (d.startsWith('54') && d[2] !== '9' && d.length === 12) d = '549' + d.slice(2);
    return d;
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    for (const a of [2, 3, 4]) {
      if (d.slice(a, a + 2) === '15') {
        d = d.slice(0, a) + d.slice(a + 2);
        break;
      }
    }
  }
  if (d.length === 10) return '549' + d;
  return d;
}

export const iniciales = (nombre) =>
  (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// ---------- Consultas

export const getAuto = (id) => db.autos.find((a) => a.id === id);
export const getCliente = (id) => db.clientes.find((c) => c.id === id);
export const getDiag = (id) => db.diagnosticos.find((d) => d.id === id);
export const autosDe = (clienteId) => db.autos.filter((a) => a.clienteId === clienteId);
export const autoPorPatente = (p) => (p ? db.autos.find((a) => a.patente === normPatente(p)) : null);

export const diagsDe = (autoId) =>
  db.diagnosticos.filter((d) => d.autoId === autoId).sort((a, b) => b.fecha - a.fecha);

export const vacio = (d) => !d.items.some((i) => i.texto.trim()) && !(d.nota || '').trim();

export const ultimaActividad = (auto) => diagsDe(auto.id)[0]?.fecha ?? auto.creado;

export const ultimoKm = (autoId) => diagsDe(autoId).find((d) => d.km)?.km ?? null;

export const nombreAuto = (a) => [a.modelo, a.anio].filter(Boolean).join(' ');

// Lo pendiente sale del último diagnóstico con contenido:
// todo lo que no está "Bien" y no se marcó como hecho.
export function pendientes(autoId, excluirId) {
  const diag = diagsDe(autoId).find((d) => d.id !== excluirId && !vacio(d));
  if (!diag) return { diag: null, items: [] };
  return { diag, items: diag.items.filter((i) => i.estado !== 'bien' && !i.hecho && i.texto.trim()) };
}

// ---------- Semáforo y trabajo realizado

export const PRIORIDAD = { urgente: 0, pronto: 1, bien: 2 };
export const porSemaforo = (items) => [...items].sort((x, y) => PRIORIDAD[x.estado] - PRIORIDAD[y.estado]);

// Checklist del auto: lo que hay que hacer según el último diagnóstico, rojo primero.
export function trabajos(autoId) {
  const diag = diagsDe(autoId).find((d) => !vacio(d));
  if (!diag) return { diag: null, items: [], hechos: 0 };
  const items = porSemaforo(diag.items.filter((i) => i.estado !== 'bien' && i.texto.trim()));
  return { diag, items, hechos: items.filter((i) => i.hecho).length };
}

// Rojo: hay urgentes sin hacer. Amarillo: queda algo. Verde: al día.
export function semaforo(autoId) {
  const { diag, items } = trabajos(autoId);
  if (!diag) return null;
  const faltan = items.filter((i) => !i.hecho);
  const color = faltan.some((i) => i.estado === 'urgente') ? 'urgente' : faltan.length ? 'pronto' : 'bien';
  return { color, faltan: faltan.length };
}

export function buscarAutos(q = '', { orden = 'reciente' } = {}) {
  const t = fold(q);
  const qp = normPatente(q);
  const qd = q.replace(/\D/g, '');
  return db.autos
    .map((a) => ({ a, c: getCliente(a.clienteId), t: ultimaActividad(a) }))
    .filter(
      ({ a, c }) =>
        !t ||
        (qp && a.patente.includes(qp)) ||
        fold(a.modelo).includes(t) ||
        (c && fold(c.nombre).includes(t)) ||
        (c && qd.length >= 4 && (c.telefono || '').replace(/\D/g, '').includes(qd)),
    )
    .map((x) => (orden === 'semaforo' ? { ...x, nivel: PRIORIDAD[semaforo(x.a.id)?.color] ?? 2 } : x))
    .sort((x, y) => (orden === 'semaforo' ? x.nivel - y.nivel : 0) || y.t - x.t);
}

// ---------- Escrituras

export function clientePara({ nombre = '', telefono = '' }) {
  nombre = nombre.trim();
  telefono = telefono.trim();
  if (!nombre && !telefono) return null;
  const wa = waNumber(telefono);
  let c = wa && db.clientes.find((x) => waNumber(x.telefono) === wa);
  if (!c && nombre) c = db.clientes.find((x) => fold(x.nombre) === fold(nombre) && (!wa || !x.telefono));
  if (c) {
    if (!c.telefono && telefono) c.telefono = telefono;
    if (!c.nombre && nombre) c.nombre = nombre;
    return c;
  }
  c = { id: uid(), nombre, telefono, creado: Date.now() };
  db.clientes.push(c);
  return c;
}

export function crearAuto({ patente = '', modelo = '', anio = '', clienteId = null }) {
  const a = {
    id: uid(),
    patente: normPatente(patente),
    modelo: modelo.trim(),
    anio: String(anio).trim(),
    clienteId,
    creado: Date.now(),
  };
  db.autos.push(a);
  return a;
}

export function nuevoDiag(autoId) {
  const d = { id: uid(), autoId, fecha: Date.now(), km: null, items: [], nota: '', enviado: null };
  db.diagnosticos.push(d);
  save();
  return d;
}

export function borrarDiag(id) {
  db.diagnosticos = db.diagnosticos.filter((d) => d.id !== id);
}

export function borrarAuto(id) {
  db.autos = db.autos.filter((a) => a.id !== id);
  db.diagnosticos = db.diagnosticos.filter((d) => d.autoId !== id);
}

export function borrarCliente(id) {
  db.clientes = db.clientes.filter((c) => c.id !== id);
  for (const a of db.autos) if (a.clienteId === id) a.clienteId = null;
}

export function limpiarVacios() {
  const antes = db.diagnosticos.length;
  db.diagnosticos = db.diagnosticos.filter((d) => !vacio(d));
  if (db.diagnosticos.length !== antes) save();
}

// ---------- Sugerencias al escribir

const COMUNES = [
  'Pastillas de freno delanteras',
  'Pastillas de freno traseras',
  'Discos de freno delanteros',
  'Discos de freno traseros',
  'Cintas de freno',
  'Líquido de frenos',
  'Service de aceite y filtros',
  'Filtro de aire',
  'Filtro de habitáculo',
  'Filtro de combustible',
  'Correa de distribución',
  'Correa de accesorios',
  'Bomba de agua',
  'Líquido refrigerante',
  'Bujías',
  'Batería',
  'Embrague',
  'Amortiguadores delanteros',
  'Amortiguadores traseros',
  'Bujes de parrilla',
  'Rótulas',
  'Extremos de dirección',
  'Bieletas',
  'Cubiertas delanteras',
  'Cubiertas traseras',
  'Alineación y balanceo',
  'Escape',
  'Luces',
  'Escobillas',
];

export function sugerencias() {
  const m = new Map();
  for (const d of db.diagnosticos) for (const i of d.items) if (i.texto.trim()) m.set(fold(i.texto), i.texto.trim());
  for (const c of COMUNES) if (!m.has(fold(c))) m.set(fold(c), c);
  return [...m.values()];
}
