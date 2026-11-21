// Datos: se guardan en el dispositivo (funciona sin señal) y se sincronizan con la nube.

const KEY = 'gianre:v1';

// Semáforo: qué tan urgente es cada falla.
export const ESTADOS = [
  ['urgente', 'Urgente'],
  ['pronto', 'Pronto'],
  ['bien', 'Buen estado'],
];
export const ESTADO_LABEL = Object.fromEntries(ESTADOS);

// Lo nuevo entra como "Pronto"; un toque lo pasa a Urgente, otro a Bien.
export const ESTADO_INICIAL = 'pronto';
export const SIGUIENTE = { pronto: 'urgente', urgente: 'bien', bien: 'pronto' };

// Qué pasó con cada falla después del diagnóstico.
export const RESULTADOS = [
  ['hecho', 'Hecho'],
  ['despues', 'Para después'],
  ['no', 'No quiso'],
];
export const RESULTADO_LABEL = Object.fromEntries(RESULTADOS);

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

// Antes cada falla tenía "hecho"; ahora tiene "resultado" (hecho, después o no quiso).
function migrarItem(it) {
  if (it.hecho && !it.resultado) {
    it.resultado = 'hecho';
    it.resultadoFecha = it.hecho;
  }
  delete it.hecho;
}
for (const d of db.diagnosticos) for (const it of d.items || []) migrarItem(it);

function persistir() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

// ---------- Sincronización: qué cambió desde la última vez
// Cada registro lleva "act" (cuándo cambió). Al guardar se compara cada registro
// con su última versión conocida. Cada falla viaja como registro propio ("items"),
// así dos personas pueden tocar fallas distintas del mismo auto sin pisarse.

const TIPOS = ['clientes', 'autos', 'diagnosticos'];
const KEY_SYNC = 'gianre:sync';
const FORMATO = 2;

function cargarMeta() {
  const base = { clave: null, version: 0, sucios: {}, borrados: {}, formato: 1 };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY_SYNC) || '{}') };
  } catch {
    return base;
  }
}
const meta = cargarMeta();
export const sync = meta;
export function guardarMeta() {
  try {
    localStorage.setItem(KEY_SYNC, JSON.stringify(meta));
  } catch {}
}

function registros() {
  const out = [];
  if (db.taller) out.push(['taller:taller', db.taller, null]);
  for (const t of ['clientes', 'autos']) for (const r of db[t]) out.push([`${t}:${r.id}`, r, null]);
  for (const d of db.diagnosticos) {
    out.push([`diagnosticos:${d.id}`, d, null]);
    for (const it of d.items) out.push([`items:${it.id}`, it, d]);
  }
  return out;
}

// La firma del diagnóstico no incluye sus fallas: cada una tiene la suya.
const firma = (k, r) =>
  JSON.stringify(r, (key, v) => (key === 'act' || (key === 'items' && k.startsWith('diagnosticos:')) ? undefined : v));
const firmas = new Map(); // clave → { f, act }
const anotar = (k, r) => firmas.set(k, { f: firma(k, r), act: r.act || 0 });
for (const [k, r] of registros()) anotar(k, r);

// Pasar al formato 2: subir todo de nuevo con las fallas como registros propios.
if ((meta.formato || 1) < FORMATO) {
  if (meta.clave) {
    const ahora = Date.now();
    for (const [k, r] of registros()) {
      r.act = k.startsWith('diagnosticos:') ? Math.max(ahora, (r.act || 0) + 1) : r.act || ahora;
      meta.sucios[k] = 1;
      anotar(k, r);
    }
    persistir();
  }
  meta.formato = FORMATO;
  guardarMeta();
}

function marcarCambios() {
  const ahora = Date.now();
  const vistos = new Set();
  let hubo = false;
  for (const [k, r] of registros()) {
    vistos.add(k);
    const f = firma(k, r);
    const prev = firmas.get(k);
    if (!prev || prev.f !== f) {
      // Siempre más nuevo que lo último conocido, aunque el reloj del equipo esté atrasado.
      r.act = Math.max(ahora, (r.act || 0) + 1, (prev?.act || 0) + 1, (meta.borrados[k] || 0) + 1);
      firmas.set(k, { f, act: r.act });
      meta.sucios[k] = 1;
      delete meta.borrados[k];
      hubo = true;
    }
  }
  for (const [k, prev] of [...firmas]) {
    if (vistos.has(k)) continue;
    firmas.delete(k);
    // El borrado también tiene que ser "más nuevo" que la última versión, si no el servidor lo ignora.
    meta.borrados[k] = Math.max(ahora, (prev.act || 0) + 1);
    meta.sucios[k] = 1;
    hubo = true;
  }
  if (hubo) guardarMeta();
  return hubo;
}

let alGuardar = null;
export const cuandoSeGuarde = (fn) => (alGuardar = fn);

export function save() {
  const hubo = marcarCambios();
  if (!persistir()) return false;
  if (hubo) alGuardar?.();
  return true;
}

// Todo lo local pasa a "para subir" (al crear el taller en la nube o al vincular).
export function marcarTodo({ menosTaller = false } = {}) {
  const ahora = Date.now();
  for (const [k, r] of registros()) {
    if (menosTaller && k === 'taller:taller') continue;
    r.act = r.act || ahora;
    anotar(k, r);
    meta.sucios[k] = 1;
  }
  persistir();
  guardarMeta();
}

const separar = (k) => {
  const i = k.indexOf(':');
  return [k.slice(0, i), k.slice(i + 1)];
};

export function paraSubir() {
  const cambios = [];
  const enviados = {};
  const mapa = new Map(registros().map(([k, r, padre]) => [k, { r, padre }]));
  for (const k of Object.keys(meta.sucios)) {
    const [tipo, id] = separar(k);
    const x = mapa.get(k);
    if (x) {
      const { r, padre } = x;
      // Lo vacío todavía no es nada: se sube cuando tenga algo.
      if (tipo === 'diagnosticos' && vacio(r)) continue;
      if (tipo === 'items' && (vacio(padre) || !r.texto.trim())) continue;
      if (!r.act) r.act = Date.now();
      let datos = r;
      if (tipo === 'diagnosticos') {
        const { items, ...resto } = r;
        datos = resto;
      } else if (tipo === 'items') datos = { ...r, diagId: padre.id };
      cambios.push({ tipo, id, act: r.act, datos });
      enviados[k] = r.act;
    } else if (meta.borrados[k]) {
      cambios.push({ tipo, id, act: meta.borrados[k], borrado: true });
      enviados[k] = meta.borrados[k];
    } else delete meta.sucios[k];
  }
  // Primero los diagnósticos, después sus fallas.
  cambios.sort((a, b) => (a.tipo === 'items') - (b.tipo === 'items'));
  return { cambios, enviados };
}

// Limpia lo que ya subió, salvo que haya vuelto a cambiar mientras tanto.
export function subidos(enviados) {
  const mapa = new Map(registros().map(([k, r]) => [k, r]));
  for (const [k, act] of Object.entries(enviados)) {
    const ahora = mapa.get(k)?.act ?? meta.borrados[k];
    if (ahora === act) delete meta.sucios[k];
  }
  guardarMeta();
}

// Mismo objeto: si una pantalla lo tiene abierto, sigue apuntando a lo correcto.
function reemplazarEnLugar(obj, datos, extra) {
  for (const key of Object.keys(obj)) delete obj[key];
  Object.assign(obj, datos, extra);
}

function olvidar(k, act) {
  firmas.delete(k);
  delete meta.sucios[k];
  meta.borrados[k] = act;
}

function aplicarItem(c, k) {
  let d = null;
  let idx = -1;
  for (const x of db.diagnosticos) {
    idx = x.items.findIndex((it) => it.id === c.id);
    if (idx >= 0) {
      d = x;
      break;
    }
  }
  const local = d?.items[idx];
  if (c.borrado) {
    if (!local || (local.act || 0) >= c.act) return false;
    d.items.splice(idx, 1);
    olvidar(k, c.act);
    return true;
  }
  const { diagId, ...datos } = c.datos || {};
  if (local) {
    if ((local.act || 0) >= c.act) return false;
    reemplazarEnLugar(local, datos, { act: c.act });
    anotar(k, local);
    delete meta.sucios[k];
    return true;
  }
  if ((meta.borrados[k] || 0) >= c.act) return false;
  const padre = getDiag(diagId);
  if (!padre) return false;
  const nuevo = { ...datos, act: c.act };
  padre.items.push(nuevo);
  anotar(k, nuevo);
  delete meta.sucios[k];
  return true;
}

// Diagnósticos guardados con el formato anterior traen las fallas adentro:
// se suman y quedan para subir como registros propios.
function sumarViejas(d, viejas) {
  let hubo = false;
  for (const v of viejas || []) {
    if (d.items.some((it) => it.id === v.id) || meta.borrados[`items:${v.id}`]) continue;
    const it = { ...v };
    migrarItem(it);
    delete it.act;
    d.items.push(it);
    hubo = true;
  }
  return hubo;
}

// Trae lo que cambió en otros dispositivos. Gana lo más nuevo, registro por registro.
export function aplicarRemotos(cambios = []) {
  let hubo = false;
  let viejasNuevas = false;
  const ordenados = [...cambios].sort((a, b) => (a.tipo === 'items') - (b.tipo === 'items'));
  for (const c of ordenados) {
    const k = `${c.tipo}:${c.id}`;
    if (c.tipo === 'taller') {
      if (c.borrado || (db.taller && (db.taller.act || 0) >= c.act)) continue;
      if (db.taller) reemplazarEnLugar(db.taller, c.datos, { act: c.act });
      else db.taller = { ...c.datos, act: c.act };
      anotar(k, db.taller);
      delete meta.sucios[k];
      hubo = true;
      continue;
    }
    if (c.tipo === 'items') {
      if (aplicarItem(c, k)) hubo = true;
      continue;
    }
    if (!TIPOS.includes(c.tipo)) continue;
    const lista = db[c.tipo];
    const i = lista.findIndex((r) => r.id === c.id);
    const local = lista[i];
    if (c.borrado) {
      if (local && (local.act || 0) < c.act) {
        lista.splice(i, 1);
        olvidar(k, c.act);
        if (c.tipo === 'diagnosticos') for (const it of local.items) firmas.delete(`items:${it.id}`);
        hubo = true;
      }
      continue;
    }
    const { items: viejas, ...datos } = c.datos || {};
    if (local) {
      if ((local.act || 0) < c.act) {
        if (c.tipo === 'diagnosticos') reemplazarEnLugar(local, datos, { act: c.act, items: local.items });
        else reemplazarEnLugar(local, c.datos, { act: c.act });
        anotar(k, local);
        delete meta.sucios[k];
        hubo = true;
      }
      if (c.tipo === 'diagnosticos' && sumarViejas(local, viejas)) hubo = viejasNuevas = true;
    } else {
      if ((meta.borrados[k] || 0) >= c.act) continue;
      const nuevo = c.tipo === 'diagnosticos' ? { ...datos, items: [], act: c.act } : { ...c.datos, act: c.act };
      lista.push(nuevo);
      anotar(k, nuevo);
      delete meta.sucios[k];
      if (c.tipo === 'diagnosticos' && sumarViejas(nuevo, viejas)) viejasNuevas = true;
      hubo = true;
    }
  }
  if (viejasNuevas) marcarCambios();
  if (hubo) persistir();
  guardarMeta();
  return hubo;
}

export const snapshot = () => JSON.stringify(db);

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

// ---------- Año aproximado según la patente
// Las patentes se entregan en orden, así que las letras dicen más o menos cuándo se patentó
// el vehículo (no siempre es el año de fabricación). No hay tabla oficial: son relevamientos
// de prensa (iProfesional, 2026), por eso se muestra como aproximado.

const letra = (c) => c.charCodeAt(0) - 65;

// Formato anterior (ABC 123): las dos primeras letras en enero de cada año.
const VIEJAS = [
  [1995, 'AA'], [1996, 'AP'], [1997, 'BD'], [1998, 'BU'], [1999, 'CM'], [2000, 'DC'],
  [2001, 'DO'], [2002, 'DX'], [2003, 'ED'], [2004, 'EI'], [2005, 'ET'], [2006, 'FI'],
  [2007, 'GB'], [2008, 'GV'], [2009, 'HT'], [2010, 'IM'], [2011, 'JN'], [2012, 'KU'],
  [2013, 'MB'], [2014, 'NM'], [2015, 'ON'], [2016, 'PM'],
];

// Mercosur (AB 123 CD): [año, mes, serie y número]. Dentro de una serie avanzan los números.
const MERCOSUR = [
  [2016, 4, 'AA000'], [2017, 1, 'AA900'], [2017, 2, 'AB000'], [2017, 11, 'AC000'],
  [2018, 1, 'AC200'], [2018, 7, 'AD000'], [2019, 1, 'AD400'], [2019, 10, 'AE000'],
  [2020, 1, 'AE100'], [2021, 1, 'AE600'], [2021, 8, 'AF000'], [2022, 10, 'AF600'],
  [2023, 1, 'AF770'], [2023, 7, 'AG000'], [2024, 12, 'AH000'], [2025, 12, 'AI000'],
];
const posMercosur = (s) => (letra(s[0]) * 26 + letra(s[1])) * 1000 + Number(s.slice(2, 5));

export function anioPorPatente(patente) {
  const p = normPatente(patente);
  const hoy = new Date().getFullYear();
  if (/^[A-Z]{3}\d{3}$/.test(p)) {
    // De la Q en adelante no se usaron en ese orden: mejor no adivinar.
    if (p[0] > 'P') return null;
    const pos = letra(p[0]) * 26 + letra(p[1]);
    let anio = null;
    for (const [a, l] of VIEJAS) if (letra(l[0]) * 26 + letra(l[1]) <= pos) anio = a;
    return anio;
  }
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return null;
  const x = posMercosur(p);
  const mes = (a, m) => a * 12 + m - 1;
  let i = -1;
  while (i + 1 < MERCOSUR.length && posMercosur(MERCOSUR[i + 1][2]) <= x) i++;
  if (i < 0) return null;
  const [a, m, s] = MERCOSUR[i];
  const sig = MERCOSUR[i + 1];
  // Entre dos referencias se reparte en proporción; después de la última, una serie por año.
  const meses = sig
    ? ((x - posMercosur(s)) / (posMercosur(sig[2]) - posMercosur(s))) * (mes(sig[0], sig[1]) - mes(a, m))
    : ((x - posMercosur(s)) / 1000) * 12;
  return Math.min(hoy, Math.floor((mes(a, m) + meses) / 12));
}

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

// ---------- Precios

export const fmtPrecio = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
export const suma = (items) => items.reduce((s, i) => s + (Number(i.precio) || 0), 0);
export const conPrecio = (items) => items.some((i) => Number(i.precio) > 0);

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

// El último kilometraje conocido: el de un diagnóstico o el de un arreglo, el más nuevo.
export function ultimoKm(autoId) {
  let km = null;
  let cuando = -Infinity;
  for (const d of diagsDe(autoId)) {
    if (d.km && d.fecha > cuando) [km, cuando] = [d.km, d.fecha];
    for (const it of d.items) {
      if (it.resultadoKm && (it.resultadoFecha || 0) > cuando) [km, cuando] = [it.resultadoKm, it.resultadoFecha || 0];
    }
  }
  return km;
}

export const nombreAuto = (a) => [a.modelo, a.anio].filter(Boolean).join(' ');

// Lo que hay que resolver de un diagnóstico (lo que está en buen estado no lleva trabajo).
export const aResolver = (d) => d.items.filter((i) => i.estado !== 'bien' && i.texto.trim());
// Cada arreglo está hecho o pendiente. Los "para después" y "no quiso" de antes cuentan como pendientes.
export const hecho = (i) => i.resultado === 'hecho';

export const PRIORIDAD = { urgente: 0, pronto: 1, bien: 2 };
export const porSemaforo = (items) => [...items].sort((x, y) => PRIORIDAD[x.estado] - PRIORIDAD[y.estado]);

// Una falla vale por su anotación más nueva: si se volvió a anotar en otra visita
// (por ejemplo, al sumar lo pendiente), cuenta la última y no se repite.
function fallasDelAuto(autoId) {
  const vistas = new Set();
  const out = [];
  for (const d of diagsDe(autoId)) {
    for (const it of aResolver(d)) {
      const k = fold(it.texto);
      if (vistas.has(k)) continue;
      vistas.add(k);
      out.push({ it, diag: d });
    }
  }
  return out;
}

// Lo que falta hacer en el vehículo, de todas las visitas: rojo primero, después lo más nuevo.
export const pendientesAuto = (autoId) =>
  fallasDelAuto(autoId)
    .filter((x) => !hecho(x.it))
    .sort((x, y) => PRIORIDAD[x.it.estado] - PRIORIDAD[y.it.estado] || y.diag.fecha - x.diag.fecha);

// Todo lo que se arregló, con su fecha: lo más nuevo primero.
export const hechosAuto = (autoId) =>
  diagsDe(autoId)
    .flatMap((d) => aResolver(d).filter(hecho).map((it) => ({ it, diag: d })))
    .sort((x, y) => (y.it.resultadoFecha || 0) - (x.it.resultadoFecha || 0));

// Lo arreglado en los últimos días: es lo que va en el resumen que se le manda al cliente.
export const hechosRecientes = (autoId, dias = 30) =>
  hechosAuto(autoId).filter((x) => (x.it.resultadoFecha || 0) >= Date.now() - dias * 864e5);

// Rojo: queda algo urgente sin hacer. Amarillo: queda algo. Verde: al día.
export function semaforo(autoId) {
  if (!diagsDe(autoId).some((d) => !vacio(d))) return null;
  const faltan = pendientesAuto(autoId);
  const color = faltan.some((x) => x.it.estado === 'urgente') ? 'urgente' : faltan.length ? 'pronto' : 'bien';
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

// Los borrados devuelven su "Deshacer": vuelve a poner solo lo que se sacó,
// sin tocar lo que haya cambiado mientras tanto.
export function borrarDiag(id) {
  const i = db.diagnosticos.findIndex((d) => d.id === id);
  if (i < 0) return () => {};
  const [d] = db.diagnosticos.splice(i, 1);
  return () => {
    if (!getDiag(d.id)) db.diagnosticos.push(d);
    save();
  };
}

export function borrarAuto(id) {
  const i = db.autos.findIndex((a) => a.id === id);
  if (i < 0) return () => {};
  const [a] = db.autos.splice(i, 1);
  const diags = db.diagnosticos.filter((d) => d.autoId === id);
  db.diagnosticos = db.diagnosticos.filter((d) => d.autoId !== id);
  return () => {
    if (!getAuto(a.id)) db.autos.push(a);
    for (const d of diags) if (!getDiag(d.id)) db.diagnosticos.push(d);
    save();
  };
}

export function borrarCliente(id) {
  const i = db.clientes.findIndex((c) => c.id === id);
  if (i < 0) return () => {};
  const [c] = db.clientes.splice(i, 1);
  const autos = db.autos.filter((a) => a.clienteId === id);
  for (const a of autos) a.clienteId = null;
  return () => {
    if (!getCliente(c.id)) db.clientes.push(c);
    for (const a of autos) if (a.clienteId == null) a.clienteId = c.id;
    save();
  };
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
