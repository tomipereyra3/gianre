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
  // Las funciones que no devuelven nada responden 204, sin cuerpo.
  if (r.status === 204) return null;
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
  if (!location.hash.startsWith('#/vincular/')) sincronizar().then(renovarAvisos);
}

// Código corto para sumar otro dispositivo (vence a los 15 minutos).
export async function pedirCodigo() {
  await sincronizar();
  if (!S.sync.clave) throw new Error('sin clave');
  return rpc('gianre_codigo', { p_clave: S.sync.clave });
}

// Código de recuperación del taller (16 letras, no vence). Se guarda acá para
// poder mostrarlo sin señal. renovar = true lo cambia y el anterior deja de servir.
export async function pedirRecuperacion(renovar = false) {
  if (!renovar && S.sync.recuperacion) return S.sync.recuperacion;
  await sincronizar();
  if (!S.sync.clave) throw new Error('sin clave');
  const codigo = await rpc('gianre_recuperacion', { p_clave: S.sync.clave, p_renovar: renovar });
  S.sync.recuperacion = codigo;
  S.guardarMeta();
  return codigo;
}

// Este dispositivo pasa a usar los datos de otro taller (por código o por email).
// Lo que ya tenía cargado se suma; el nombre y logo del taller vienen del otro.
async function usarClave(clave, recuperacion = null) {
  generacion++;
  while (enCurso) {
    try {
      await enCurso;
    } catch {}
  }
  S.sync.clave = clave;
  S.sync.version = 0;
  S.sync.recuperacion = recuperacion;
  if (S.db.taller) S.db.taller.act = 0;
  S.marcarTodo({ menosTaller: true });
  await sincronizar();
  if (estado !== 'ok' && estado !== 'subiendo') throw new Error('no sincronizó');
  renovarAvisos();
}

export async function vincular(codigo) {
  const clave = await rpc('gianre_vincular', { p_codigo: codigo });
  // Si entró con el código de recuperación, ese ya es el código del taller.
  const limpio = codigo.replace(/[^a-z0-9]/gi, '').toUpperCase();
  await usarClave(clave, limpio.length === 16 ? limpio : null);
}

// ---------- Cuenta con email: se pide un código de 6 números y con él se entra desde cualquier dispositivo.

const AUTH = 'https://lkbbgyskjyyhepdxpbej.supabase.co/auth/v1/';

async function auth(ruta, cuerpo) {
  const r = await fetch(AUTH + ruta, {
    method: 'POST',
    headers: { apikey: PUBLICA, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.error_code || datos.msg || `auth: ${r.status}`);
    e.status = r.status;
    e.codigo = datos.error_code || '';
    throw e;
  }
  return datos;
}

// El mail trae un link (y, si la plantilla lo incluye, un código de 6 números).
export const pedirCodigoEmail = (email) =>
  auth(`otp?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { email, create_user: true });

function emailDelToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '';
  } catch {
    return '';
  }
}

// Con la sesión (del código o del link del mail) se pide la clave del taller de la cuenta.
export async function entrarConSesion(token, email = emailDelToken(token)) {
  const r = await fetch(API + 'gianre_entrar', {
    method: 'POST',
    headers: { apikey: PUBLICA, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_clave: S.sync.clave || null }),
  });
  if (!r.ok) throw new Error(`gianre_entrar: ${r.status}`);
  const clave = await r.json();
  S.sync.email = email;
  S.guardarMeta();
  // Mismo taller: no cambia nada. Otro taller (el de la cuenta): se usan sus datos.
  if (clave === S.sync.clave) return sincronizar();
  await usarClave(clave, null);
}

export async function entrarConEmail(email, codigo, alVerificar) {
  const sesion = await auth('verify', { type: 'email', email, token: codigo });
  alVerificar?.();
  return entrarConSesion(sesion.access_token, email);
}

// ---------- Avisos al celular: los pendientes de cada mañana (Web Push).
// En iPhone solo funcionan con la app instalada en la pantalla de inicio.

const AVISOS = 'https://lkbbgyskjyyhepdxpbej.supabase.co/functions/v1/gianre-avisos';

export const avisosPosibles = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const permisoAvisos = () => (avisosPosibles() ? Notification.permission : 'denied');

function deB64u(t) {
  t = t.replace(/-/g, '+').replace(/_/g, '/');
  t += '='.repeat((4 - (t.length % 4)) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}

async function suscripcion() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function anotarAviso(sub) {
  const j = sub.toJSON();
  await rpc('gianre_aviso_guardar', {
    p_clave: S.sync.clave,
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
  });
}

// 'imposible' · 'bloqueados' · 'activos' · 'apagados'
export async function estadoAvisos() {
  if (!avisosPosibles()) return 'imposible';
  const p = permisoAvisos();
  if (p === 'denied') return 'bloqueados';
  if (p === 'granted' && (await suscripcion().catch(() => null))) return 'activos';
  return 'apagados';
}

// Se llama desde un toque: iOS solo pide permiso así.
export async function activarAvisos() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    const e = new Error('sin permiso');
    e.permiso = permiso;
    throw e;
  }
  if (!S.sync.clave) await sincronizar();
  if (!S.sync.clave) throw new Error('sin clave');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publica } = await (await fetch(AVISOS)).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publica) });
  }
  await anotarAviso(sub);
  // Un primer aviso al toque: confirma que llegan.
  fetch(AVISOS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: S.sync.clave, endpoint: sub.endpoint }),
  }).catch(() => {});
}

export async function desactivarAvisos() {
  const sub = await suscripcion().catch(() => null);
  if (!sub) return;
  if (S.sync.clave) await rpc('gianre_aviso_quitar', { p_clave: S.sync.clave, p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Al abrir y al cambiar de taller: este celular se vuelve a anotar con la clave actual.
export async function renovarAvisos() {
  if (!S.sync.clave || permisoAvisos() !== 'granted') return;
  const sub = await suscripcion().catch(() => null);
  if (sub) await anotarAviso(sub).catch(() => {});
}
