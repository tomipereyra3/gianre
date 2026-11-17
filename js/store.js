// Datos: todo vive en este dispositivo (localStorage).

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

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
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

export function buscarAutos(q = '') {
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
    .sort((x, y) => y.t - x.t);
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
