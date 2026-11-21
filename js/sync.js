// Compu y celular con los mismos datos. Todo en segundo plano:
// se trabaja sin señal y se sincroniza cuando hay.
import * as S from './store.js';

const API = 'https://lkbbgyskjyyhepdxpbej.supabase.co/rest/v1/rpc/';
// Clave pública (va en la app a propósito): solo permite llamar a las funciones
// del taller, y cada una pide la clave secreta del dispositivo.
const PUBLICA = 'sb_publishable_vib7ql3pEFRDqEiF6e_40A_UvF82WjM';

async function rpc(fn, args = {}) {
  const r = await fetch(API + fn, {
    method: 'POST',
    headers: { apikey: PUBLICA, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const e = new Error(`${fn}: ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// 'apagado' (todavía no hay taller) · 'ok' · 'subiendo' · 'sin-conexion' · 'error'
export let estado = 'apagado';
const oyentes = new Set();
export const alCambiarEstado = (fn) => oyentes.add(fn);
function poner(e) {
  if (estado === e) return;
  estado = e;
  for (const fn of oyentes) fn(e);
}

let enCurso = null;
let otraVez = false;
let timer = 0;
let alTraer = null;
// Cambia al vincular: lo que estaba en viaje con la conexión anterior se descarta.
let generacion = 0;

export function programar(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(sincronizar, ms);
}

export function sincronizar() {
  if (!S.db.taller && !S.sync.clave) return Promise.resolve();
  if (enCurso) {
    otraVez = true;
    return enCurso;
  }
  const mia = generacion;
  enCurso = (async () => {
    try {
      poner('subiendo');
      if (!S.sync.clave) {
        const nueva = await rpc('gianre_nuevo_taller');
        if (mia !== generacion) return;
        S.sync.clave = nueva;
        S.sync.version = 0;
        S.marcarTodo();
      }
      const { cambios, enviados } = S.paraSubir();
      const res = await rpc('gianre_sincronizar', {
        p_clave: S.sync.clave,
        p_desde: S.sync.version || 0,
        p_cambios: cambios,
      });
      if (mia !== generacion) return;
      S.subidos(enviados);
      const trajo = S.aplicarRemotos(res.cambios);
      S.sync.version = res.hasta;
      S.guardarMeta();
      poner(Object.keys(S.sync.sucios).length ? 'subiendo' : 'ok');
      if (trajo) alTraer?.();
    } catch (e) {
      poner(navigator.onLine === false || !e.status ? 'sin-conexion' : 'error');
    } finally {
      enCurso = null;
      if (otraVez) {
        otraVez = false;
        programar(300);
      }
    }
  })();
  return enCurso;
}

export function iniciar(onTraer) {
  alTraer = onTraer;
  S.cuandoSeGuarde(() => programar(1500));
  addEventListener('online', () => sincronizar());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sincronizar();
  });
  // Lo que cargan en el otro dispositivo aparece solo.
  setInterval(() => {
    if (!document.hidden) sincronizar();
  }, 20000);
  // Si se abrió con un link de vinculación, primero se vincula.
  if (!location.hash.startsWith('#/vincular/')) sincronizar();
}

// Código corto para sumar otro dispositivo (vence a los 15 minutos).
export async function pedirCodigo() {
  await sincronizar();
  if (!S.sync.clave) throw new Error('sin clave');
  return rpc('gianre_codigo', { p_clave: S.sync.clave });
}

// Este dispositivo pasa a usar los datos del taller del código.
// Lo que ya tenía cargado se suma; el nombre y logo del taller vienen del otro.
export async function vincular(codigo) {
  const clave = await rpc('gianre_vincular', { p_codigo: codigo });
  generacion++;
  while (enCurso) {
    try {
      await enCurso;
    } catch {}
  }
  S.sync.clave = clave;
  S.sync.version = 0;
  if (S.db.taller) S.db.taller.act = 0;
  S.marcarTodo({ menosTaller: true });
  await sincronizar();
  if (estado !== 'ok' && estado !== 'subiendo') throw new Error('no sincronizó');
}
