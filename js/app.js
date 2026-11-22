import * as S from './store.js';
import { h, fill, icon, plate, avatar, field, input, autosize, snack, cerrarSnackViejo } from './ui.js';
import { dibujarReporte, dibujarPDF, archivoPNG, archivoPDF, FUENTES } from './report.js';
import * as Sync from './sync.js';

const app = document.getElementById('app');

// ---------- Arranque

S.limpiarVacios();

let logoImg = null;
function cargarLogo() {
  const src = S.db.taller?.logo;
  logoImg = null;
  if (!src) return Promise.resolve();
  const img = new Image();
  logoImg = img;
  return new Promise((ok) => {
    img.onload = img.onerror = () => ok();
    img.src = src;
  });
}
cargarLogo();

// Sin esto, iOS no muestra el estado "apretado" (:active) de los botones.
document.addEventListener('touchstart', () => {}, { passive: true });

// La imagen se dibuja con Archivo: la dejamos cargada desde el inicio.
if (document.fonts) for (const f of FUENTES) document.fonts.load(f).catch(() => {});

const dlItems = h('datalist', { id: 'dl-items' });
const dlClientes = h('datalist', { id: 'dl-clientes' });
document.body.append(dlItems, dlClientes);
function refrescarListas() {
  dlItems.replaceChildren(...S.sugerencias().map((v) => h('option', { value: v })));
  dlClientes.replaceChildren(
    ...S.db.clientes.filter((c) => c.nombre).map((c) => h('option', { value: c.nombre })),
  );
}

// ---------- Navegación (hash + historial, el botón atrás de Android funciona)

const rutas = [
  [/^\/$/, inicio],
  [/^\/nuevo$/, nuevo],
  [/^\/auto\/(\w+)(?:\/(diagnostico|reparacion|historial))?(?:\/(\w+))?$/, vehiculo],
  [/^\/cliente\/(\w+)$/, fichaCliente],
  [/^\/diag\/(\w+)$/, (id) => S.getDiag(id) && vehiculo(S.getDiag(id).autoId, 'diagnostico', id)],
  [/^\/ajustes$/, ajustes],
];

let salir = null;
let enfocar = null;
let rutaActual = null;
const scrolls = {};
const ruta = () => location.hash.slice(1) || '/';
const profundidad = () => history.state?.depth ?? 0;

function go(p, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState']({ depth: profundidad() + (replace ? 0 : 1) }, '', '#' + p);
  render();
}

function volver(fallback = '/') {
  if (profundidad() > 0) history.back();
  else go(fallback, { replace: true });
}

function render({ pop = false, mantener = false } = {}) {
  // Redibujar la misma pantalla (por un cambio que llegó) no es salir de ella.
  const misma = mantener && ruta() === rutaActual;
  // Lo que estaba escrito en un campo se guarda antes de cambiar de pantalla.
  if (!misma) document.activeElement?.blur?.();
  if (rutaActual) scrolls[rutaActual] = scrollY;
  const y = mantener ? scrollY : pop ? scrolls[ruta()] || 0 : 0;
  if (!mantener) cerrarSnackViejo();
  quitarCapa();
  if (!misma) salir?.();
  salir = null;
  rutaActual = ruta();
  let el = null;
  const v = rutaActual.match(/^\/vincular\/(\w+)$/);
  if (v) el = vinculando(v[1]);
  else if (!S.db.taller) el = bienvenida();
  else {
    for (const [re, fn] of rutas) {
      const m = rutaActual.match(re);
      if (m) {
        el = fn(...m.slice(1));
        break;
      }
    }
  }
  if (!el) return go('/', { replace: true });
  pintarLateral(!v && !!S.db.taller);
  app.replaceChildren(el);
  scrollTo(0, y);
  sombraBarra();
  // Enfocar en el mismo toque que abrió la pantalla: así el teclado sube solo (iOS incluido).
  // Si solo se redibujó por un cambio que llegó, no se abre el teclado.
  if (enfocar && !misma) enfocar.focus({ preventScroll: true });
  enfocar = null;
}

const refrescar = () => render({ mantener: true });

// Capas (hojas y vista previa) también responden al botón atrás.
let capa = null;
let trasCerrar = null;

function abrirCapa(el) {
  quitarCapa();
  document.body.append(el);
  document.documentElement.classList.add('locked');
  history.pushState({ depth: profundidad(), capa: true }, '');
  capa = el;
}

function cerrarCapa(luego) {
  if (!capa) return luego?.();
  if (history.state?.capa) {
    trasCerrar = luego || null;
    history.back();
  } else {
    quitarCapa();
    luego?.();
  }
}

function quitarCapa() {
  if (!capa) return;
  const el = capa;
  capa = null;
  el.classList.add('closing');
  setTimeout(() => el.remove(), 200);
  document.documentElement.classList.remove('locked');
}

addEventListener('popstate', () => {
  if (capa) {
    quitarCapa();
    const f = trasCerrar;
    trasCerrar = null;
    f?.();
    return;
  }
  render({ pop: true });
});

function sombraBarra() {
  document.querySelector('.screen > .bar, .screen > .search')?.classList.toggle('scrolled', scrollY > 4);
}
addEventListener('scroll', sombraBarra, { passive: true });

// ---------- Menú de la compu (a la izquierda; en el celular no se ve)

let lateral = null;
function pintarLateral(visible) {
  document.body.classList.toggle('con-menu', visible);
  if (!visible) return;
  if (!lateral) {
    const item = (r, ic, texto) =>
      h(
        'button',
        { class: 'lat-item', type: 'button', 'data-ruta': r, onclick: () => rutaActual !== r && go(r) },
        icon(ic),
        texto,
      );
    lateral = h(
      'aside',
      { class: 'lateral', 'aria-label': 'Menú' },
      h('div', { class: 'lat-taller' }, h('small', null, 'Gianre'), h('b', { class: 'lat-nombre' })),
      h(
        'nav',
        { class: 'lat-nav' },
        item('/', 'home', 'Vehículos'),
        item('/nuevo', 'add', 'Crear diagnóstico'),
        item('/ajustes', 'tune', 'Ajustes del taller'),
      ),
      h(
        'div',
        { class: 'lat-pie' },
        estadoNube(),
        h('button', { class: 'btn btn-gris btn-sm block', type: 'button', onclick: vincularOtro }, icon('qr'), 'Conectar otro dispositivo'),
      ),
    );
    app.before(lateral);
  }
  fill(lateral.querySelector('.lat-nombre'), S.db.taller?.nombre || '');
  const seccion = /^\/(nuevo|diag\/)/.test(rutaActual) ? '/nuevo' : rutaActual === '/ajustes' ? '/ajustes' : '/';
  for (const b of lateral.querySelectorAll('.lat-item')) {
    if (b.dataset.ruta === seccion) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

// ---------- Piezas comunes

const bar = (...kids) => h('header', { class: 'bar' }, ...kids);
const iconBtn = (name, label, onclick, cls = '') =>
  h('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
const backBtn = (fallback) => iconBtn('back', 'Volver', () => volver(fallback));
// Ocupa el lugar del botón que falta, así el título queda al centro.
const hueco = () => h('span', { class: 'icon-btn hueco', 'aria-hidden': 'true' });
const barTitulo = (t) => h('div', { class: 'bar-title' }, t);
const cta = (label, onclick) =>
  h('div', { class: 'bottombar cta' }, h('button', { class: 'btn btn-primary', type: 'button', onclick }, icon('add'), label));
const titulo = (t) => h('h2', { class: 'label' }, t);

function sacudir(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function enterPasaA(desde, hacia) {
  desde.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    typeof hacia === 'function' ? hacia() : hacia.focus();
  });
}

function completarTelefono(nombre, tel) {
  nombre.addEventListener('change', () => {
    const c = S.db.clientes.find((x) => S.fold(x.nombre) === S.fold(nombre.value));
    if (c && !tel.value) tel.value = c.telefono || '';
  });
}

function hoja(tituloHoja, contenido, { onSubmit, foco = false } = {}) {
  const form = h(
    'form',
    {
      class: 'sheet',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        onSubmit?.();
      },
    },
    h('div', { class: 'grab' }),
    h('h2', null, tituloHoja),
    contenido,
  );
  abrirCapa(h('div', { class: 'layer' }, h('div', { class: 'scrim', onclick: () => cerrarCapa() }), form));
  if (foco) requestAnimationFrame(() => form.querySelector('input')?.focus());
  return form;
}

// Antes de borrar, una pregunta clara. "Cancelar" queda justo abajo.
function confirmarBorrado({ titulo, texto, boton = 'Eliminar', alConfirmar }) {
  hoja(
    titulo,
    [
      texto ? h('p', { class: 'hint confirmar-texto' }, texto) : null,
      h('button', { class: 'btn btn-peligro block', type: 'submit' }, icon('trash'), boton),
      h('button', { class: 'btn btn-ghost block', type: 'button', onclick: () => cerrarCapa() }, 'Cancelar'),
    ],
    { onSubmit: () => cerrarCapa(alConfirmar) },
  );
}

// Un auto se reconoce por la patente; si no la cargaron, por el cliente.
const identidad = (a, c, size = '') =>
  a.patente ? plate(a.patente, size) : h('span', { class: `ident ${size}` }, avatar(c, size));

// Semáforo del auto: Urgente, Pronto o Al día.
const LUZ = { urgente: 'Urgente', pronto: 'Pronto', bien: 'Al día' };
function pillSemaforo(luz, cls = '') {
  const faltan = luz.faltan === 1 ? '1 trabajo pendiente' : `${luz.faltan} trabajos pendientes`;
  return h(
    'span',
    { class: `pill ${cls}`, 'data-estado': luz.color, title: luz.color === 'bien' ? 'Al día' : faltan },
    h('i', { class: 'dot' }),
    LUZ[luz.color],
  );
}

const mayusculas = (t) => t.trim().replace(/(^|\s)(\p{L})/gu, (_, s, l) => s + l.toUpperCase());

// Tarjeta de un auto: patente, modelo y cliente, semáforo y plata que queda por hacer.
function filaAuto(a, c, cuando, onclick, cls = '') {
  const luz = S.semaforo(a.id);
  const principal = S.nombreAuto(a) || c?.nombre;
  const sub = principal ? [S.nombreAuto(a) ? c?.nombre : null, cuando].filter(Boolean).join(' · ') : '';
  const queda = S.suma(S.pendientesAuto(a.id).map((x) => x.it));
  return h(
    'button',
    { class: `auto ${cls}`, type: 'button', 'data-estado': luz?.color, onclick: onclick || (() => go('/auto/' + a.id)) },
    h('span', { class: 'auto-id' }, identidad(a, c)),
    h('span', { class: 'auto-titulo' }, principal || cuando.charAt(0).toUpperCase() + cuando.slice(1)),
    sub ? h('span', { class: 'auto-sub' }, sub) : null,
    luz ? pillSemaforo(luz) : null,
    queda ? h('span', { class: 'auto-monto' }, S.fmtPrecio(queda), h('small', null, ' pendiente')) : null,
    h('span', { class: 'auto-go', 'aria-hidden': 'true' }, icon('arrow')),
  );
}

// ---------- Bienvenida

// Un solo dato, una sola vez: el nombre que encabeza cada diagnóstico.
let sinEmail = false;

function bienvenida() {
  // Con cuenta pero sin datos del taller (cuenta nueva) o sin email: se pide el nombre.
  if (S.sync.clave || sinEmail) return pasoNombre();
  const pasos = h('div', { class: 'bienvenida-pasos' });
  pasosEmail(pasos, () => {
    history.replaceState({ depth: 0 }, '', '#/');
    render();
  });
  return h(
    'div',
    { class: 'screen bienvenida' },
    h(
      'div',
      { class: 'bienvenida-body' },
      h('span', { class: 'marca-nombre' }, 'Gianre'),
      h('h1', null, 'Ingresá con tu email'),
      pasos,
      h(
        'button',
        {
          class: 'btn-text ya-uso',
          type: 'button',
          onclick: () => {
            sinEmail = true;
            render();
          },
        },
        'Entrar sin email',
      ),
    ),
  );
}

function pasoNombre() {
  const nombre = input({
    class: 'input big',
    placeholder: 'Ej: Taller Rodríguez',
    autocapitalize: 'words',
    enterkeyhint: 'go',
    'aria-label': 'Nombre del taller',
  });
  const empezar = () => {
    const n = nombre.value.trim();
    if (!n) {
      nombre.focus();
      return sacudir(nombre);
    }
    S.db.taller = { nombre: n, telefono: '', direccion: '', logo: null };
    S.save();
    history.replaceState({ depth: 0 }, '', '#/');
    render();
  };
  enterPasaA(nombre, empezar);
  enfocar = nombre;
  return h(
    'div',
    { class: 'screen bienvenida' },
    h(
      'div',
      { class: 'bienvenida-body' },
      h('span', { class: 'marca-nombre' }, 'Gianre'),
      h('h1', null, 'Nombre del taller'),
      nombre,
      h('button', { class: 'btn btn-primary block', type: 'button', onclick: empezar }, 'Guardar y continuar', icon('flecha')),
      S.sync.clave
        ? null
        : h(
            'button',
            {
              class: 'btn-text ya-uso',
              type: 'button',
              onclick: () => {
                sinEmail = false;
                render();
              },
            },
            'Ingresar con email',
          ),
    ),
  );
}

// ---------- Entrar con email: llega un código de 6 números

const emailValido = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim());

function errorEmail(e) {
  if (navigator.onLine === false || !e.status) return 'Sin internet. Probá de nuevo.';
  if (e.status === 429 || /rate/.test(e.codigo)) return 'Esperá un minuto y pedí otro código';
  if (e.codigo === 'email_address_not_authorized') return 'Todavía no se pueden mandar códigos a ese email';
  if (/otp|token|expired|invalid/i.test(`${e.codigo} ${e.message}`)) return 'Código incorrecto o vencido';
  return 'No se pudo. Probá de nuevo.';
}

// Los dos pasos (email y código) dentro de un contenedor; alTerminar se llama al entrar.
function pasosEmail(contenedor, alTerminar) {
  let email = '';
  const pasoEmail = () => {
    const campo = input({
      class: 'input big',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      autocapitalize: 'off',
      placeholder: 'tu@email.com',
      enterkeyhint: 'send',
      'aria-label': 'Email',
      value: email,
    });
    const boton = h('button', { class: 'btn btn-primary block', type: 'button' }, 'Recibir código');
    const enviar = async () => {
      const t = campo.value.trim();
      if (!emailValido(t)) {
        campo.focus();
        return sacudir(campo);
      }
      boton.disabled = true;
      fill(boton, 'Enviando…');
      try {
        await Sync.pedirCodigoEmail(t);
        email = t;
        pasoCodigo();
      } catch (e) {
        boton.disabled = false;
        fill(boton, 'Recibir código');
        snack(errorEmail(e));
      }
    };
    boton.addEventListener('click', enviar);
    enterPasaA(campo, enviar);
    fill(contenedor, campo, boton);
    requestAnimationFrame(() => campo.focus());
  };
  const pasoCodigo = () => {
    const campo = input({
      class: 'input big codigo',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: '6',
      placeholder: '000000',
      enterkeyhint: 'go',
      'aria-label': 'Código de 6 números',
    });
    const boton = h('button', { class: 'btn btn-primary block', type: 'button' }, 'Entrar');
    let entrando = false;
    const entrar = async () => {
      const c = campo.value.replace(/\D/g, '');
      if (c.length !== 6) {
        campo.focus();
        return sacudir(campo);
      }
      if (entrando) return;
      entrando = true;
      boton.disabled = true;
      fill(boton, 'Entrando…');
      try {
        await Sync.entrarConEmail(email, c);
        alTerminar();
      } catch (e) {
        entrando = false;
        boton.disabled = false;
        fill(boton, 'Entrar');
        sacudir(campo);
        snack(errorEmail(e));
      }
    };
    campo.addEventListener('input', () => {
      campo.value = campo.value.replace(/\D/g, '').slice(0, 6);
      if (campo.value.length === 6) entrar();
    });
    boton.addEventListener('click', entrar);
    enterPasaA(campo, entrar);
    fill(
      contenedor,
      h('p', { class: 'enviado-a' }, `Código enviado a ${email}`),
      campo,
      boton,
      h('button', { class: 'btn-text', type: 'button', onclick: pasoEmail }, 'Cambiar email'),
    );
    requestAnimationFrame(() => campo.focus());
  };
  pasoEmail();
}

// Desde Ajustes o el aviso del inicio: el taller de este dispositivo queda guardado con el email.
function ingresarConEmailHoja() {
  const pasos = h('div', { class: 'bienvenida-pasos' });
  hoja('Ingresar con email', [pasos]);
  pasosEmail(pasos, () =>
    cerrarCapa(() => {
      refrescar();
      snack('Listo. Tus datos quedan guardados con tu email.');
    }),
  );
}

// ---------- Instalar la app (solo en el celular)

let pedidoInstalar = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoInstalar = e;
});
addEventListener('appinstalled', () => {
  pedidoInstalar = null;
  for (const b of document.querySelectorAll('.btn-instalar')) b.remove();
});
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esCelular = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(min-width: 1024px)').matches;

function botonInstalar() {
  if (!esCelular() || instalada()) return null;
  return h('button', { class: 'btn-instalar', type: 'button', onclick: instalar }, icon('download'), 'Instalar app');
}

async function instalar() {
  if (pedidoInstalar) {
    pedidoInstalar.prompt();
    const r = await pedidoInstalar.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') pedidoInstalar = null;
    return;
  }
  const iphone =
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  hoja(
    'Instalar la app',
    [
      h(
        'ol',
        { class: 'pasos-instalar' },
        iphone
          ? [h('li', null, 'Tocá ', icon('compartir'), ' Compartir'), h('li', null, 'Elegí «Agregar a inicio»')]
          : [h('li', null, 'Abrí el menú ⋮ del navegador'), h('li', null, 'Elegí «Instalar app»')],
      ),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Listo'),
    ],
    { onSubmit: () => cerrarCapa() },
  );
}

// Pantallas de un solo mensaje (vinculando, listo): mismo formato que la bienvenida.
const pantallaCentro = (...kids) =>
  h('div', { class: 'screen bienvenida' }, h('div', { class: 'bienvenida-body' }, h('span', { class: 'marca-nombre' }, 'Gianre'), ...kids));

// ---------- Compu y celular: vincular dispositivos

const TEXTO_NUBE = {
  ok: 'Datos guardados en la nube',
  subiendo: 'Guardando en la nube…',
  'sin-conexion': 'Sin internet: se guarda cuando vuelva la señal',
  error: 'Error al guardar en la nube. Reintentando…',
  apagado: 'Guardando en la nube…',
};
function estadoNube(cls = '') {
  const el = h('p', { class: `nube ${cls}`, role: 'status' });
  const pintar = (e) => {
    el.dataset.estado = e;
    fill(el, icon(e === 'ok' ? 'nubeOk' : 'nube'), h('span', null, TEXTO_NUBE[e] || ''));
  };
  pintar(Sync.estado);
  Sync.alCambiarEstado((e) => el.isConnected && pintar(e));
  return el;
}

let vinculandoAhora = null;
function vinculando(codigo) {
  const texto = h('p', { class: 'lead' }, 'Descargando los datos de tu taller…');
  // Si la pantalla se redibuja mientras conecta, no repetir el pedido.
  if (vinculandoAhora === codigo) return pantallaCentro(h('h1', null, 'Conectando dispositivo'), texto);
  vinculandoAhora = codigo;
  Sync.vincular(codigo)
    .finally(() => (vinculandoAhora = null))
    .then(() => {
      if (enSafariDeIphone()) return listoEnSafari(codigo);
      history.replaceState({ depth: 0 }, '', '#/');
      render();
      snack('Dispositivo conectado. Ya tenés los mismos datos.');
    })
    .catch(() => {
      fill(texto, 'El código venció o no es válido. Pedí uno nuevo en el otro dispositivo.');
      fill(
        acciones,
        h('button', { class: 'btn btn-primary block', type: 'button', onclick: tengoCodigo }, 'Ingresar otro código'),
      );
    });
  const acciones = h('div', { class: 'bienvenida-acciones' });
  return pantallaCentro(h('h1', null, 'Conectando dispositivo'), texto, acciones);
}

// iPhone: el QR abre Safari, que no comparte datos con la app de la pantalla de inicio.
const enSafariDeIphone = () =>
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  !(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);

const fmtCodigo = (c) => (c.match(/.{1,4}/g) || []).join(' ');

function listoEnSafari(codigo) {
  const limpio = codigo.replace(/[^a-z0-9]/gi, '').toUpperCase();
  pintarLateral(false);
  app.replaceChildren(
    pantallaCentro(
      h('h1', null, 'Dispositivo conectado'),
      h('p', { class: 'lead' }, 'Si tenés Gianre en la pantalla de inicio, abrilo, tocá «Ya uso Gianre en otro dispositivo» y escribí este código:'),
      h('div', { class: 'codigo-grande' }, fmtCodigo(limpio)),
      h(
        'div',
        { class: 'bienvenida-acciones' },
        h(
          'button',
          {
            class: 'btn btn-primary block',
            type: 'button',
            onclick: () => {
              history.replaceState({ depth: 0 }, '', '#/');
              render();
            },
          },
          'Seguir en el navegador',
        ),
      ),
    ),
  );
}

// ---------- Código de recuperación (por si pierden el único dispositivo)

function recuperacionGuardada() {
  if (!S.db.taller) return;
  S.db.taller.recuperacionGuardada = Date.now();
  S.save();
}

// Se lo mandan a sí mismos por WhatsApp: el link recupera todo con un toque.
async function mandarRecuperacion(codigo) {
  const link = `${location.origin}${location.pathname}#/vincular/${codigo}`;
  const text = `Código para recuperar ${S.db.taller?.nombre || 'el taller'} en Gianre: ${fmtCodigo(codigo)}\nSi perdés el celular, abrí este link y recuperás todo:\n${link}`;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      recuperacionGuardada();
      return snack('Guardado. Si perdés el celular, abrí ese link.');
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    recuperacionGuardada();
    snack('Copiado. Pegalo en tu chat de WhatsApp.');
  } catch {
    snack('No se pudo copiar. Anotá el código.');
  }
}

function verRecuperacion() {
  const cuerpo = h('div', { class: 'vincular' }, h('p', { class: 'hint' }, 'Buscando tu código…'));
  const pintar = (codigo) =>
    fill(
      cuerpo,
      h('div', { class: 'codigo-grande' }, fmtCodigo(codigo)),
      h(
        'button',
        { class: 'btn btn-wa block', type: 'button', onclick: () => mandarRecuperacion(codigo) },
        icon('wa'),
        'Enviarme el código por WhatsApp',
      ),
      h(
        'button',
        {
          class: 'btn-text',
          type: 'button',
          onclick: () =>
            Sync.pedirRecuperacion(true)
              .then((nuevo) => {
                if (S.db.taller) {
                  delete S.db.taller.recuperacionGuardada;
                  S.save();
                }
                pintar(nuevo);
                snack('Código nuevo generado. El anterior ya no sirve.');
              })
              .catch(() => snack('Necesitás internet para cambiarlo')),
        },
        'Generar código nuevo',
      ),
    );
  hoja('Código de recuperación', [cuerpo, h('button', { class: 'btn btn-ghost block', type: 'submit' }, 'Cerrar')], {
    onSubmit: () => cerrarCapa(),
  });
  Sync.pedirRecuperacion()
    .then(pintar)
    .catch(() => fill(cuerpo, h('p', { class: 'hint' }, 'Necesitás internet para ver el código. Probá cuando haya señal.')));
}

// Recordatorio en el inicio hasta que lo guarden (con "Ahora no" vuelve en una semana).
const KEY_RECORDAR = 'gianre:recordar-email';
function avisoCuenta() {
  let pospuesto = 0;
  try {
    pospuesto = Number(localStorage.getItem(KEY_RECORDAR)) || 0;
  } catch {}
  if (S.sync.email || pospuesto > Date.now() || !S.db.diagnosticos.some((d) => !S.vacio(d))) return null;
  const el = h(
    'div',
    { class: 'aviso' },
    h('b', null, 'Guardá tus datos con tu email'),
    h(
      'div',
      { class: 'aviso-acciones' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: ingresarConEmailHoja }, 'Ingresar con email'),
      h(
        'button',
        {
          class: 'btn-text',
          type: 'button',
          onclick: () => {
            try {
              localStorage.setItem(KEY_RECORDAR, String(Date.now() + 7 * 864e5));
            } catch {}
            el.remove();
          },
        },
        'Ahora no',
      ),
    ),
  );
  return el;
}

// ---------- Avisos de pendientes en el celular

const KEY_RECORDAR_AVISOS = 'gianre:recordar-avisos';

async function activarAvisosUI(boton) {
  const antes = boton?.textContent;
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Activando…';
  }
  try {
    await Sync.activarAvisos();
    snack('Avisos activados');
  } catch (e) {
    snack(e.permiso ? 'El celular no dio permiso para los avisos' : 'No se pudieron activar los avisos');
  }
  if (boton?.isConnected) {
    boton.disabled = false;
    boton.textContent = antes;
  }
  refrescar();
}

// Tarjeta en el inicio, una sola vez (o hasta "Ahora no"): solo donde los avisos pueden llegar.
function avisoAvisos() {
  let pospuesto = 0;
  try {
    pospuesto = Number(localStorage.getItem(KEY_RECORDAR_AVISOS)) || 0;
  } catch {}
  if (
    !Sync.avisosPosibles() ||
    Notification.permission !== 'default' ||
    pospuesto > Date.now() ||
    !S.db.diagnosticos.some((d) => !S.vacio(d))
  )
    return null;
  const activar = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => activarAvisosUI(activar) }, icon('campana'), 'Activar avisos');
  const el = h(
    'div',
    { class: 'aviso' },
    h('b', null, 'Recibí los pendientes cada mañana'),
    h(
      'div',
      { class: 'aviso-acciones' },
      activar,
      h(
        'button',
        {
          class: 'btn-text',
          type: 'button',
          onclick: () => {
            try {
              localStorage.setItem(KEY_RECORDAR_AVISOS, String(Date.now() + 14 * 864e5));
            } catch {}
            el.remove();
          },
        },
        'Ahora no',
      ),
    ),
  );
  return el;
}

// Fila de Ajustes: activar, ver que están activos o por qué no se puede.
function filaAvisos() {
  const card = h('div', { class: 'card' });
  const fila = (sub, accion) =>
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'avatar mas' }, icon('campana')),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Pendientes cada mañana'), h('span', { class: 'row-sub' }, sub)),
      accion,
    );
  const pintar = async () => {
    const e = await Sync.estadoAvisos();
    if (e === 'imposible') {
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) && !instalada();
      return fill(
        card,
        fila(
          iphone ? 'Instalá la app para recibirlos' : 'Este navegador no recibe avisos',
          iphone ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: instalar }, 'Instalar') : null,
        ),
      );
    }
    if (e === 'bloqueados') return fill(card, fila('Bloqueados en los ajustes del celular', null));
    if (e === 'activos')
      return fill(
        card,
        fila(
          'Activados · 8:30, de lunes a sábado',
          h(
            'button',
            {
              class: 'btn-text',
              type: 'button',
              onclick: async () => {
                await Sync.desactivarAvisos();
                snack('Avisos desactivados');
                pintar();
              },
            },
            'Desactivar',
          ),
        ),
      );
    const activar = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => activarAvisosUI(activar) }, 'Activar');
    fill(card, fila('8:30, de lunes a sábado', activar));
  };
  pintar();
  return card;
}

function tengoCodigo() {
  const campo = input({
    class: 'input big codigo',
    placeholder: 'Código',
    maxlength: '24',
    autocapitalize: 'characters',
    autocorrect: 'off',
    enterkeyhint: 'go',
    'aria-label': 'Código',
  });
  const boton = h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Conectar');
  hoja(
    'Ingresar código',
    [
      campo,
      boton,
    ],
    {
      foco: true,
      onSubmit: async () => {
        const c = campo.value.replace(/[^a-z0-9]/gi, '');
        if (c.length !== 8 && c.length !== 16) return sacudir(campo);
        boton.disabled = true;
        fill(boton, 'Conectando…');
        try {
          await Sync.vincular(c);
          cerrarCapa(() => {
            history.replaceState({ depth: 0 }, '', '#/');
            render();
            snack('Dispositivo conectado. Ya tenés los mismos datos.');
          });
        } catch {
          boton.disabled = false;
          fill(boton, 'Conectar');
          sacudir(campo);
          snack(navigator.onLine === false ? 'Sin internet. Conectate y probá de nuevo.' : 'Ese código venció o no es válido');
        }
      },
    },
  );
}

// QR para escanear con el celular + el mismo código para tipear en la compu.
let qrLib = null;
function cargarQR() {
  qrLib ||= new Promise((ok, mal) => {
    const sc = h('script', { src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js' });
    sc.onload = () => ok(window.qrcode);
    sc.onerror = mal;
    document.head.append(sc);
  });
  return qrLib;
}

function dibujarQR(qrcode, texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `-2 -2 ${n + 4} ${n + 4}`);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Código QR para conectar otro dispositivo');
  svg.innerHTML = `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#141414"/>`;
  return svg;
}

function vincularOtro() {
  const cuerpo = h('div', { class: 'vincular' }, h('p', { class: 'hint' }, 'Generando código…'));
  hoja('Conectar otro dispositivo', [cuerpo, h('button', { class: 'btn btn-ghost block', type: 'submit' }, 'Cerrar')], {
    onSubmit: () => cerrarCapa(),
  });
  Promise.all([Sync.pedirCodigo(), cargarQR()])
    .then(([codigo, qrcode]) => {
      const link = `${location.origin}${location.pathname}#/vincular/${codigo}`;
      fill(
        cuerpo,
        dibujarQR(qrcode, link),
        h('p', { class: 'vincular-paso' }, 'Escaneá con la cámara del otro celular'),
        h('div', { class: 'codigo-grande' }, `${codigo.slice(0, 4)} ${codigo.slice(4)}`),
      );
    })
    .catch(() =>
      fill(cuerpo, h('p', { class: 'hint' }, 'Necesitás internet para conectar otro dispositivo. Probá cuando haya señal.')),
    );
}

// ---------- Inicio

let busqueda = '';

function inicio() {
  const t = S.db.taller;
  const autos = S.db.autos;
  const conteo = { urgente: 0, pronto: 0, bien: 0 };
  for (const a of autos) {
    const luz = S.semaforo(a.id);
    if (luz) conteo[luz.color]++;
  }
  const esperan = conteo.urgente + conteo.pronto;
  const resumen = !autos.length
    ? null
    : esperan
      ? esperan === 1
        ? '1 vehículo con trabajos pendientes'
        : `${esperan} vehículos con trabajos pendientes`
      : 'Todos los vehículos al día';

  const lista = h('div', { class: 'autos' });
  const dibujar = () => {
    if (!autos.length) return lista.replaceChildren(vacioInicio());
    const res = S.buscarAutos(busqueda, { orden: 'semaforo' });
    lista.replaceChildren(
      ...(res.length
        ? res.map(({ a, c, t }) => filaAuto(a, c, S.hace(t)))
        : [h('p', { class: 'none' }, `No hay vehículos que coincidan con “${busqueda.trim()}”`)]),
    );
  };

  dibujar();

  const nuevoDiag = () => go('/nuevo');
  return h(
    'div',
    { class: 'screen inicio' },
    h(
      'header',
      { class: 'home-head' },
      h('div', { class: 'home-taller' }, h('b', null, t.nombre), estadoNube()),
      botonInstalar(),
      iconBtn('tune', 'Ajustes del taller', () => go('/ajustes')),
    ),
    h('div', { class: 'home-saludo' }, h('h1', null, 'Vehículos'), resumen ? h('p', null, resumen) : null),
    h(
      'div',
      { class: 'search' },
      autos.length
        ? h(
            'label',
            null,
            icon('search'),
            h('input', {
              type: 'search',
              value: busqueda,
              placeholder: 'Buscar patente, cliente o modelo',
              'aria-label': 'Buscar patente, cliente o modelo',
              autocomplete: 'off',
              spellcheck: 'false',
              enterkeyhint: 'search',
              oninput: (e) => {
                busqueda = e.target.value;
                dibujar();
              },
            }),
          )
        : null,
      h('button', { class: 'btn btn-primary solo-compu', type: 'button', onclick: nuevoDiag }, icon('add'), 'Crear diagnóstico'),
    ),
    avisoCuenta() || avisoAvisos(),
    lista,
    cta('Crear diagnóstico', nuevoDiag),
  );
}

function vacioInicio() {
  return h(
    'div',
    { class: 'empty' },
    h('h3', null, 'Todavía no hay vehículos'),
  );
}

// ---------- Nuevo diagnóstico: un solo dato (patente o cliente) y a escribir

function nuevo() {
  let q = '';
  const pantalla = h('div', { class: 'screen angosta nuevo-diag' });
  const resultados = h('div');

  const campo = h('input', {
    placeholder: 'Patente o nombre del cliente',
    maxlength: '40',
    autocapitalize: 'words',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Patente o nombre del cliente',
    oninput: (e) => {
      q = e.target.value;
      // La patente se acomoda sola: AD 482 KJ / ABC 123.
      const f = S.fmtPatente(q);
      if (S.parecePatente(q) && f.includes(' ') && f !== q && e.target.selectionStart === q.length) {
        e.target.value = f;
      }
      actualizar();
    },
  });

  let primero = null; // lo que hace Enter: la primera fila de la lista
  enterPasaA(campo, () => primero?.());

  function actualizar() {
    const t = q.trim();
    const esPatente = S.parecePatente(t);
    const qp = S.normPatente(t);
    const exacto = esPatente
      ? S.autoPorPatente(qp)
      : S.buscarAutos(t).find(({ c }) => c && S.fold(c.nombre) === S.fold(t))?.a;
    const matches = S.buscarAutos(t).slice(0, 5);
    if (exacto) matches.sort((x, y) => (y.a === exacto) - (x.a === exacto));

    const puedeCrear = t.length >= 2 && !(esPatente && exacto);
    // Una patente completa que no existe, o un nombre sin coincidencias: lo nuevo va primero.
    const nuevoPrimero = puedeCrear && !exacto && (!matches.length || (esPatente && qp.length >= 6));
    const nueva = puedeCrear ? filaNueva(t, esPatente, qp, !!exacto) : null;

    const filas = matches.map(({ a, c, t: ts }) =>
      filaAuto(a, c, S.hace(ts), () => empezarCon(a), a === exacto ? 'exacto' : ''),
    );
    primero = nuevoPrimero || !matches.length ? (puedeCrear ? crear : null) : () => empezarCon(matches[0].a);

    fill(
      resultados,
      !t && matches.length ? titulo('Vehículos recientes') : null,
      filas.length || nueva ? h('div', { class: 'autos' }, nuevoPrimero ? [nueva, filas] : [filas, nueva]) : null,
    );
  }

  // Patente: se ve la patente. Nombre: una persona para sumar como cliente.
  function filaNueva(t, esPatente, qp, yaEsCliente) {
    return h(
      'button',
      { class: 'auto nueva', type: 'button', onclick: crear },
      h('span', { class: 'auto-id' }, esPatente ? plate(qp) : h('span', { class: 'avatar persona-nueva' }, icon('personaMas'))),
      h('span', { class: 'auto-titulo' }, esPatente ? 'Agregar vehículo nuevo' : mayusculas(t)),
      h(
        'span',
        { class: 'auto-sub' },
        esPatente ? 'Se crea con esta patente' : yaEsCliente ? 'Agregar otro vehículo' : 'Agregar cliente nuevo',
      ),
      h('span', { class: 'auto-go', 'aria-hidden': 'true' }, icon('add')),
    );
  }

  function empezarCon(a) {
    const d = S.nuevoDiag(a.id);
    go(`/auto/${a.id}/diagnostico/${d.id}`, { replace: true });
  }

  function crear() {
    const t = q.trim();
    if (t.length < 2) return sacudir(campo);
    pasoDatos(S.parecePatente(t) ? { patente: S.normPatente(t) } : { nombre: mayusculas(t) });
  }

  function pasoBuscar() {
    fill(
      pantalla,
      bar(iconBtn('close', 'Cerrar', () => volver('/')), barTitulo('Crear diagnóstico'), hueco()),
      h('div', { class: 'nuevo-titulo' }, h('h1', null, 'Seleccionar vehículo')),
      h('label', { class: 'buscar-grande' }, icon('search'), campo),
      h('div', { class: 'lista-nuevo' }, resultados),
    );
    actualizar();
  }

  // Lo mínimo del vehículo y del cliente. Todo se puede omitir y completar después.
  function pasoDatos(base) {
    refrescarListas();
    const pat = base.patente ? null : input({ autocapitalize: 'characters', maxlength: '10', placeholder: 'Ej: AB 123 CD' });
    const mod = input({ autocapitalize: 'words', placeholder: 'Ej: Fiat Cronos' });
    const an = input({ inputmode: 'numeric', maxlength: '4' });
    const nom = input({ value: base.nombre, autocapitalize: 'words', placeholder: 'Ej: Martín Gómez', list: 'dl-clientes' });
    const tel = input({ type: 'tel', inputmode: 'tel', placeholder: 'Ej: 11 2345 6789', enterkeyhint: 'go' });
    if (pat) sugerirAnio(pat, an);
    else {
      const x = S.anioPorPatente(base.patente);
      if (x) an.placeholder = `≈ ${x}`;
    }
    completarTelefono(nom, tel);
    const orden = [pat, mod, an, nom, tel].filter(Boolean);
    orden.forEach((el, i) => enterPasaA(el, orden[i + 1] || (() => terminar(true))));

    function terminar(conDatos) {
      const v = (el) => (conDatos && el ? el.value.trim() : '');
      const p = base.patente || S.normPatente(v(pat));
      const c = S.clientePara({ nombre: v(nom) || base.nombre || '', telefono: v(tel) });
      let a = p ? S.autoPorPatente(p) : null;
      if (a) {
        if (c) a.clienteId = c.id;
        a.modelo ||= v(mod);
        a.anio ||= v(an);
      } else {
        a = S.crearAuto({ patente: p, modelo: v(mod), anio: v(an), clienteId: c?.id || null });
      }
      S.save();
      empezarCon(a);
    }

    fill(
      pantalla,
      bar(
        iconBtn('back', 'Volver', () => {
          pasoBuscar();
          campo.focus({ preventScroll: true });
        }),
        barTitulo('Crear diagnóstico'),
        hueco(),
      ),
      h(
        'div',
        { class: 'nuevo-titulo' },
        h(
          'div',
          { class: 'datos-id' },
          base.patente
            ? plate(base.patente, 'sm')
            : [h('span', { class: 'avatar persona-nueva sm' }, icon('persona')), h('b', null, base.nombre)],
        ),
        h('h1', null, 'Completar datos'),
      ),
      h(
        'div',
        { class: 'datos-form' },
        h(
          'section',
          { class: 'datos-grupo' },
          h('h2', { class: 'datos-sub' }, 'Vehículo'),
          h(
            'div',
            { class: 'fields' },
            pat ? field('Patente', pat) : null,
            h('div', { class: 'fields-row' }, field('Marca y modelo', mod), field('Año', an, 'w-anio')),
          ),
        ),
        h(
          'section',
          { class: 'datos-grupo' },
          h('h2', { class: 'datos-sub' }, 'Cliente'),
          h('div', { class: 'fields' }, field('Nombre y apellido', nom), field('Número de WhatsApp', tel)),
        ),
      ),
      h(
        'div',
        { class: 'bottombar' },
        h('button', { class: 'btn btn-gris omitir', type: 'button', onclick: () => terminar(false) }, 'Omitir'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => terminar(true) }, 'Continuar', icon('flecha')),
      ),
    );
    scrollTo(0, 0);
    // En el mismo toque: así el teclado sigue arriba (iOS incluido).
    orden[0].focus({ preventScroll: true });
  }

  pasoBuscar();
  enfocar = campo;
  return pantalla;
}

// ---------- Diagnóstico: se escribe como un mensaje de WhatsApp, una falla por renglón
// Vive dentro de la sección "Diagnóstico" del vehículo.

function editorPartes(d, a) {
  refrescarListas();
  salir = () => {
    confirmar();
    if (S.vacio(d)) S.borrarDiag(d.id);
    S.save();
  };
  // Se guarda solo con cada cambio; la marca "Guardado" lo hace visible.
  const marcaGuardado = h('span', { class: 'guardado', hidden: true }, icon('check'), 'Guardado');
  const guardar = () => {
    S.save();
    marcaGuardado.hidden = false;
    programarPrevia();
  };
  const lista = h('div', { class: 'items' });
  const filas = new Map();

  const nuevoItem = h('input', {
    placeholder: 'Agregar falla detectada',
    list: 'dl-items',
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint: 'enter',
    'aria-label': 'Agregar falla detectada',
    onblur: () => confirmar(),
    // Si pegan una lista (ej: copiada de WhatsApp), cada renglón es una falla.
    onpaste: (e) => {
      const t = e.clipboardData?.getData('text') || '';
      if (!/\n/.test(t)) return;
      e.preventDefault();
      for (const l of t.split(/\r?\n/)) {
        const { texto, estado } = S.interpretarLinea(l);
        if (texto) agregar(texto, estado);
      }
    },
  });
  enterPasaA(nuevoItem, () => confirmar());

  function confirmar() {
    const { texto, estado } = S.interpretarLinea(nuevoItem.value);
    nuevoItem.value = '';
    if (texto) agregar(texto, estado);
  }

  function agregar(texto, estado, precio = null) {
    const it = { id: S.uid(), texto, estado, precio, resultado: null, resultadoFecha: null };
    d.items.push(it);
    guardar();
    lista.append(filaItem(it, true));
    mostrarBanner();
    // Si vuelve una falla que ya tenía precio, se muestran los precios.
    if (precio) activarPrecios();
    sumar();
  }

  function filaItem(it, animar = false) {
    const txt = autosize(
      h('textarea', {
        rows: '1',
        value: it.texto,
        autocomplete: 'off',
        autocapitalize: 'sentences',
        enterkeyhint: 'done',
        'aria-label': 'Falla detectada',
        oninput: (e) => {
          it.texto = e.target.value.replace(/\n/g, ' ');
          guardar();
        },
        onblur: () => {
          if (!it.texto.trim()) quitar(it, false);
        },
      }),
    );
    enterPasaA(txt, () => txt.blur());
    // La prioridad cambia con un toque: Pronto → Urgente → Buen estado.
    const chip = h(
      'button',
      {
        class: 'chip',
        type: 'button',
        'data-estado': it.estado,
        'aria-label': `Prioridad ${S.ESTADO_LABEL[it.estado]}. Tocá para cambiar.`,
        onclick: () => {
          it.estado = S.SIGUIENTE[it.estado];
          chip.dataset.estado = it.estado;
          chip.lastChild.textContent = S.ESTADO_LABEL[it.estado];
          chip.setAttribute('aria-label', `Prioridad ${S.ESTADO_LABEL[it.estado]}. Tocá para cambiar.`);
          chip.classList.remove('tap');
          void chip.offsetWidth;
          chip.classList.add('tap');
          guardar();
        },
      },
      h('i', { class: 'dot' }),
      h('span', null, S.ESTADO_LABEL[it.estado]),
    );
    const precio = h('input', {
      class: 'precio',
      inputmode: 'numeric',
      autocomplete: 'off',
      placeholder: 'Precio',
      'aria-label': `Precio de ${it.texto}`,
      value: it.precio ? Number(it.precio).toLocaleString('es-AR') : '',
      oninput: (e) => {
        const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
        it.precio = Number.isFinite(n) && n > 0 ? n : null;
        e.target.value = it.precio ? it.precio.toLocaleString('es-AR') : '';
        guardar();
        sumar();
      },
    });
    enterPasaA(precio, () => precio.blur());
    const row = h(
      'div',
      { class: `item${animar ? ' nuevo' : ''}` },
      chip,
      h(
        'div',
        { class: 'item-cuerpo' },
        txt,
        h('label', { class: 'precio-fila' }, h('span', null, '$'), precio),
        // Lo que ya se arregló lo dice acá también.
        S.hecho(it)
          ? h(
              'span',
              { class: 'res-tag res-hecho' },
              `Hecho${it.resultadoFecha ? ` el ${S.fmtFecha(it.resultadoFecha)}` : ''}${it.resultadoKm ? ` · ${S.fmtKm(it.resultadoKm)} km` : ''}`,
            )
          : null,
      ),
      h(
        'button',
        {
          class: 'x',
          type: 'button',
          'aria-label': 'Quitar falla',
          onclick: () =>
            it.texto.trim()
              ? confirmarBorrado({
                  titulo: 'Quitar falla',
                  texto: it.texto.trim(),
                  boton: 'Quitar falla',
                  alConfirmar: () => quitar(it, true),
                })
              : quitar(it, false),
        },
        icon('close'),
      ),
    );
    filas.set(it.id, row);
    return row;
  }

  function quitar(it, conDeshacer) {
    const i = d.items.indexOf(it);
    if (i < 0) return;
    d.items.splice(i, 1);
    guardar();
    filas.get(it.id)?.remove();
    mostrarBanner();
    sumar();
    if (conDeshacer && it.texto.trim()) {
      snack(`Falla quitada: “${it.texto.trim()}”`, 'Deshacer', () => {
        if (!S.getDiag(d.id)) return;
        if (!d.items.some((x) => x.id === it.id)) d.items.splice(Math.min(i, d.items.length), 0, it);
        guardar();
        // Si la pantalla se redibujó mientras tanto, se vuelve a dibujar con la falla.
        if (!lista.isConnected) return refrescar();
        for (const x of d.items) if (filas.get(x.id)) lista.append(filas.get(x.id));
        mostrarBanner();
        sumar();
      });
    }
  }

  for (const it of S.porSemaforo(d.items)) lista.append(filaItem(it));

  // Lo que quedó pendiente de visitas anteriores, a un toque.
  const bannerBox = h('div');
  function mostrarBanner() {
    const faltan = S.pendientesAuto(a.id)
      .filter((x) => x.diag.id !== d.id && x.diag.fecha < d.fecha)
      .map((x) => x.it)
      .filter((p) => !d.items.some((i) => S.fold(i.texto) === S.fold(p.texto)));
    fill(
      bannerBox,
      faltan.length && !d.enviado
        ? h(
            'div',
            { class: 'banner' },
            h(
              'div',
              { class: 'banner-text' },
              h('b', null, faltan.length === 1 ? '1 pendiente de visitas anteriores' : `${faltan.length} pendientes de visitas anteriores`),
              h('span', null, faltan.map((i) => i.texto.trim()).join(', ')),
            ),
            h(
              'button',
              {
                class: 'btn btn-sm',
                type: 'button',
                onclick: () => {
                  for (const p of faltan) agregar(p.texto.trim(), p.estado, p.precio || null);
                },
              },
              'Sumar',
            ),
          )
        : null,
    );
  }
  mostrarBanner();

  // Kilometraje y nota: solo si los quieren, escondidos detrás de un "+".
  const km = h('input', {
    inputmode: 'numeric',
    placeholder: '0',
    autocomplete: 'off',
    value: S.fmtKm(d.km),
    'aria-label': 'Kilometraje',
    oninput: (e) => {
      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
      d.km = Number.isFinite(n) && n > 0 ? n : null;
      e.target.value = S.fmtKm(d.km);
      guardar();
    },
  });
  enterPasaA(km, () => km.blur());
  const kmBox = h('label', { class: 'km', hidden: !d.km }, h('span', null, 'Kilometraje'), km, h('span', { class: 'unit' }, 'km'));

  const nota = autosize(
    h('textarea', {
      class: 'input nota',
      rows: '2',
      placeholder: 'Nota para el cliente',
      'aria-label': 'Nota para el cliente',
      value: d.nota || '',
      oninput: (e) => {
        d.nota = e.target.value;
        guardar();
      },
    }),
  );
  const notaBox = h('div', { class: 'nota-box', hidden: !(d.nota || '').trim() }, nota);

  const extra = (label, box, foco) => {
    const b = h(
      'button',
      {
        class: 'chip-add',
        type: 'button',
        hidden: !box.hidden,
        onclick: () => {
          box.hidden = false;
          b.hidden = true;
          foco.focus();
        },
      },
      icon('add'),
      label,
    );
    return b;
  };

  function eliminar() {
    const borrar = () => {
      const tenia = !S.vacio(d);
      const deshacer = S.borrarDiag(d.id);
      S.save();
      salir = null;
      go(`/auto/${a.id}/historial`, { replace: true });
      if (tenia)
        snack('Diagnóstico eliminado', 'Deshacer', () => {
          deshacer();
          refrescar();
        });
    };
    // Si todavía no tiene nada, no hay nada que perder.
    if (S.vacio(d)) return borrar();
    confirmarBorrado({
      titulo: 'Eliminar diagnóstico',
      texto: 'Se borra con todas sus fallas, en todos tus dispositivos.',
      boton: 'Eliminar diagnóstico',
      alConfirmar: borrar,
    });
  }

  // Precios: aparecen cuando el mecánico ya los averiguó (presupuesto).
  let conPrecios = !!d.precios || S.conPrecio(d.items);
  const totales = [];
  function sumar() {
    const vivos = d.items.filter((i) => i.texto.trim());
    const t = S.suma(vivos);
    for (const el of totales) {
      fill(
        el,
        h('span', null, vivos.length === 1 ? 'Presupuesto · 1 falla' : `Presupuesto · ${vivos.length} fallas`),
        h('b', null, S.fmtPrecio(t)),
      );
      el.hidden = !conPrecios || !t;
    }
  }
  // La tarjeta de abajo: total, ver cómo queda y enviar.
  function tarjetaEnvio(enCelu) {
    const total = h('div', { class: 'envio-total' });
    totales.push(total);
    return h(
      'div',
      { class: 'envio' },
      total,
      h(
        'div',
        { class: 'envio-botones' },
        enCelu
          ? h(
              'button',
              { class: 'btn-circulo btn-ojo', type: 'button', 'aria-label': 'Ver cómo lo recibe el cliente', title: 'Ver cómo lo recibe el cliente', onclick: () => verPrevia(d) },
              icon('eye'),
            )
          : null,
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => enviar(d, enCelu ? 'png' : formatoPrevia) },
          icon('wa'),
          d.enviado ? 'Enviar de nuevo' : conPrecios ? 'Enviar presupuesto' : 'Enviar diagnóstico',
        ),
      ),
    );
  }

  // En la compu, al lado: cómo lo recibe el cliente, al instante.
  const previaHojas = h('div', { class: 'previa-hojas' });
  const previaOpciones = h('div', { class: 'segmento', role: 'tablist', 'aria-label': 'Formato' });
  let previaTimer = 0;
  function pintarPrevia() {
    clearTimeout(previaTimer);
    if (!esCompu.matches || !previaHojas.isConnected) return;
    pintarOpciones(previaOpciones, pintarPrevia);
    if (S.vacio(d))
      return fill(previaHojas);
    const datos = datosReporte(d);
    const hojas = formatoPrevia === 'pdf' ? dibujarPDF(datos) : [dibujarReporte(datos)];
    fill(
      previaHojas,
      S.db.taller?.logo
        ? null
        : h('button', { class: 'sumar-logo', type: 'button', onclick: () => elegirLogo(pintarPrevia) }, icon('image'), 'Agregar el logo del taller'),
      h('div', { class: `hojas ${formatoPrevia}` }, hojas),
    );
  }
  function programarPrevia() {
    clearTimeout(previaTimer);
    if (esCompu.matches) previaTimer = setTimeout(pintarPrevia, 450);
  }
  esCompu.addEventListener('change', pintarPrevia);
  const salirEditor = salir;
  salir = () => {
    clearTimeout(previaTimer);
    esCompu.removeEventListener('change', pintarPrevia);
    salirEditor();
  };
  requestAnimationFrame(pintarPrevia);

  function activarPrecios() {
    if (conPrecios) return;
    conPrecios = d.precios = true;
    guardar();
    cuerpo.classList.add('con-precios');
    btnPrecios.hidden = true;
    sumar();
  }
  const btnPrecios = h(
    'button',
    {
      class: 'chip-add',
      type: 'button',
      hidden: conPrecios,
      onclick: () => {
        activarPrecios();
        lista.querySelector('.precio')?.focus();
      },
    },
    icon('add'),
    'Agregar precios',
  );

  // Diagnóstico nuevo: el teclado ya abierto, listo para escribir.
  if (!d.items.length) enfocar = nuevoItem;

  // Arriba: cuál es (el de hoy o uno anterior) y si ya se le mandó al cliente.
  const ultimo = S.diagsDe(a.id)[0];
  const esHoy = S.isoLocal(d.fecha) === S.isoLocal(Date.now());
  const crearNuevo = () => {
    const nd = S.nuevoDiag(a.id);
    go(`/auto/${a.id}/diagnostico/${nd.id}`, { replace: true });
  };
  const cabeza = h(
    'div',
    { class: 'sec' },
    h(
      'div',
      { class: 'sec-head' },
      h(
        'div',
        { class: 'sec-tit' },
        h('h2', null, esHoy ? 'Diagnóstico de hoy' : `Diagnóstico del ${S.fmtFecha(d.fecha)}`),
        h('small', null, h('span', null, S.fmtFecha(d.fecha, true)), marcaGuardado),
      ),
      h('span', { class: `estado-diag${d.enviado ? ' enviado' : ''}` }, d.enviado ? `Enviado el ${S.fmtFecha(d.enviado)}` : 'Sin enviar'),
    ),
    d.enviado || ultimo !== d
      ? h('button', { class: 'btn btn-gris block', type: 'button', onclick: crearNuevo }, icon('add'), 'Crear diagnóstico nuevo')
      : null,
  );

  const cuerpo = h(
    'div',
    { class: `editor-cols${conPrecios ? ' con-precios' : ''}` },
    h(
      'div',
      { class: 'editor-main' },
      bannerBox,
      h(
        'section',
        { class: 'lista-fallas', 'aria-label': 'Fallas' },
        lista,
        h('label', { class: 'add' }, h('span', { class: 'plus' }, icon('add')), nuevoItem),
      ),
      h('div', { class: 'extras' }, btnPrecios, extra('Agregar kilometraje', kmBox, km), extra('Agregar nota', notaBox, nota)),
      kmBox,
      notaBox,
      h('div', { class: 'sec-pie' }, h('button', { class: 'btn-text danger', type: 'button', onclick: eliminar }, 'Eliminar este diagnóstico')),
    ),
    h(
      'aside',
      { class: 'previa', 'aria-label': 'Vista previa' },
      h('div', { class: 'previa-head' }, h('h2', null, 'Vista previa para el cliente'), previaOpciones),
      previaHojas,
      tarjetaEnvio(false),
    ),
  );
  const abajo = tarjetaEnvio(true);
  sumar();
  return { cuerpo: [cabeza, cuerpo], abajo, clase: 'editor' };
}

// ---------- Envío

const datosReporte = (d, modo = 'diagnostico') => {
  const auto = S.getAuto(d.autoId);
  return { taller: S.db.taller, logo: logoImg, auto, cliente: S.getCliente(auto?.clienteId), diag: d, modo };
};

function nombreArchivo(d, ext, modo = 'diagnostico') {
  const a = S.getAuto(d.autoId);
  const que = modo === 'trabajo' ? 'Trabajo-realizado' : 'Diagnostico';
  return `${que}-${a?.patente || 'auto'}-${S.isoLocal(modo === 'trabajo' ? Date.now() : d.fecha)}.${ext}`;
}

function descargar(file) {
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// En el celular abre el menú de compartir (WhatsApp aparece primero).
// En la compu descarga el archivo y abre el chat del cliente.
async function compartir(file, cliente) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'compartido';
    } catch (e) {
      if (e.name === 'AbortError') return null;
    }
  }
  descargar(file);
  const wa = S.waNumber(cliente?.telefono);
  if (wa) window.open(`https://wa.me/${wa}`, '_blank', 'noopener');
  return 'descargado';
}

// modo 'diagnostico': lo que hay que hacer. modo 'trabajo': lo que se hizo y lo que queda.
function borradoEnOtro(d) {
  if (S.getDiag(d.id) && S.getAuto(d.autoId)) return false;
  snack('Este diagnóstico se eliminó en otro dispositivo');
  volver('/');
  return true;
}

function enviar(d, formato, modo = 'diagnostico') {
  document.activeElement?.blur?.();
  if (borradoEnOtro(d)) return;
  if (S.vacio(d)) return snack('Agregá al menos una falla para poder enviarlo');
  // Todo sincrónico hasta share(): Safari exige que siga "dentro" del toque.
  const datos = datosReporte(d, modo);
  const nombre = nombreArchivo(d, formato, modo);
  const file =
    formato === 'pdf' ? archivoPDF(dibujarPDF(datos), nombre) : archivoPNG(dibujarReporte(datos), nombre);
  const cliente = S.getCliente(S.getAuto(d.autoId)?.clienteId);
  compartir(file, cliente).then((r) => {
    if (!r) return;
    if (modo === 'trabajo') d.trabajoEnviado = Date.now();
    else d.enviado = Date.now();
    S.save();
    const aviso = () =>
      snack(
        r === 'compartido'
          ? 'Enviado. Quedó guardado en el historial'
          : formato === 'pdf'
            ? 'PDF descargado. Adjuntalo en el chat del cliente.'
            : 'Imagen descargada. Adjuntala en el chat del cliente.',
      );
    capa ? cerrarCapa(aviso) : aviso();
  });
}

// Vista previa: lo mismo que va a recibir el cliente, como imagen o como PDF.
let formatoPrevia = 'png';
const esCompu = matchMedia('(min-width: 1024px)');

function pintarOpciones(el, repintar) {
  fill(
    el,
    [
      ['png', 'Imagen'],
      ['pdf', 'PDF'],
    ].map(([f, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(formatoPrevia === f),
          onclick: () => {
            formatoPrevia = f;
            repintar();
          },
        },
        label,
      ),
    ),
  );
}

function verPrevia(d) {
  document.activeElement?.blur?.();
  if (borradoEnOtro(d)) return;
  if (S.vacio(d)) return snack('Agregá al menos una falla para poder enviarlo');
  const cuerpo = h('div', { class: 'viewer-body' });
  const opciones = h('div', { class: 'segmento', role: 'tablist', 'aria-label': 'Formato' });
  function pintar() {
    const datos = datosReporte(d);
    const hojas = formatoPrevia === 'pdf' ? dibujarPDF(datos) : [dibujarReporte(datos)];
    for (const cv of hojas) {
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', formatoPrevia === 'pdf' ? 'Página del PDF' : 'Imagen para WhatsApp');
    }
    fill(
      cuerpo,
      S.db.taller?.logo
        ? null
        : h(
            'button',
            { class: 'sumar-logo', type: 'button', onclick: () => elegirLogo(pintar) },
            icon('image'),
            'Agregar el logo del taller',
          ),
      h('div', { class: `hojas ${formatoPrevia}` }, hojas),
    );
    pintarOpciones(opciones, pintar);
  }
  pintar();
  abrirCapa(
    h(
      'div',
      { class: 'layer viewer' },
      bar(iconBtn('close', 'Cerrar', () => cerrarCapa()), barTitulo('Vista previa'), opciones),
      cuerpo,
      h(
        'div',
        { class: 'bottombar' },
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => enviar(d, formatoPrevia) },
          icon('wa'),
          'Enviar por WhatsApp',
        ),
      ),
    ),
  );
}

// ---------- Vehículo: tres secciones con el menú de abajo
// Diagnóstico (fallas y presupuesto) → Reparación (marcar lo hecho) → Historial (todo lo hecho y lo que falta).

function vehiculo(id, tab, diagId) {
  const a = S.getAuto(id);
  if (!a) return null;
  const c = S.getCliente(a.clienteId);
  const pend = S.pendientesAuto(a.id);
  const diags = S.diagsDe(a.id);
  const borrador = diags[0] && !diags[0].enviado && !S.vacio(diags[0]);
  // Sin sección elegida: el borrador si hay uno, si no lo que falta hacer, si no el historial.
  tab ||= borrador ? 'diagnostico' : pend.length ? 'reparacion' : diags.some((d) => !S.vacio(d)) ? 'historial' : 'diagnostico';
  const partes =
    tab === 'diagnostico' ? seccionDiagnostico(a, diagId) : tab === 'reparacion' ? seccionReparacion(a, pend) : seccionHistorial(a);
  if (!partes) return null;
  return h(
    'div',
    { class: `screen vehiculo tab-${tab} ${partes.clase || ''}` },
    cabeceraVehiculo(a, c, tab !== 'diagnostico'),
    menuVehiculo(a, tab, pend.length),
    partes.cuerpo,
    partes.abajo ? h('div', { class: 'bottombar' }, partes.abajo) : null,
  );
}

function cabeceraVehiculo(a, c, chica) {
  const nombre = S.nombreAuto(a);
  const km = S.ultimoKm(a.id);
  const wa = S.waNumber(c?.telefono);
  // Lo que falta, a un toque: abre la hoja con ese dato listo para escribir.
  const faltan = [
    !wa && ['wa', 'Agregar WhatsApp', 'wa'],
    !a.patente && ['add', 'Patente', 'patente'],
    !a.anio && ['add', 'Año', 'anio'],
  ].filter(Boolean);
  if (chica) {
    return bar(
      iconBtn('back', 'Volver a vehículos', () => volver('/')),
      h(
        'button',
        { class: 'bar-veh', type: 'button', 'aria-label': 'Datos del vehículo y del cliente', onclick: () => editarDatos(a) },
        identidad(a, c, 'xs'),
        h(
          'span',
          { class: 'bar-veh-texto' },
          h('b', null, nombre || c?.nombre || 'Vehículo'),
          h('small', null, [nombre ? c?.nombre : null, km ? `${S.fmtKm(km)} km` : null].filter(Boolean).join(' · ')),
        ),
      ),
      iconBtn('edit', 'Datos del vehículo y del cliente', () => editarDatos(a)),
    );
  }
  return [
    bar(
      iconBtn('back', 'Volver a vehículos', () => volver('/')),
      h('div', { class: 'bar-centro' }, identidad(a, c, 'sm')),
      iconBtn('edit', 'Datos del vehículo y del cliente', () => editarDatos(a)),
    ),
    h(
      'div',
      { class: 'veh-datos' },
      h(
        'div',
        { class: 'veh-texto' },
        a.modelo
          ? h('h1', null, nombre)
          : h('button', { class: 'h1-falta', type: 'button', onclick: () => editarDatos(a, 'modelo') }, 'Agregar marca y modelo'),
        h(
          'p',
          { class: 'veh-sub' },
          c
            ? h('button', { class: 'veh-cliente', type: 'button', onclick: () => go('/cliente/' + c.id) }, c.nombre || 'Cliente sin nombre')
            : h('button', { class: 'veh-cliente', type: 'button', onclick: () => editarDatos(a, 'cliente') }, 'Agregar cliente'),
          !a.modelo && a.anio ? h('span', null, `· ${a.anio}`) : null,
          km ? h('span', null, `· ${S.fmtKm(km)} km`) : null,
        ),
        faltan.length
          ? h(
              'div',
              { class: 'faltan' },
              faltan.map(([ic, label, foco]) =>
                h(
                  'button',
                  { class: `chip-add falta-${foco}`, type: 'button', onclick: () => editarDatos(a, foco) },
                  icon(ic),
                  label,
                ),
              ),
            )
          : null,
      ),
      wa
        ? h(
            'a',
            {
              class: 'btn-circulo chico wa',
              href: `https://wa.me/${wa}`,
              target: '_blank',
              rel: 'noopener',
              'aria-label': 'Abrir chat de WhatsApp con el cliente',
              title: 'Abrir chat de WhatsApp',
            },
            icon('wa'),
          )
        : null,
    ),
  ];
}

// El menú de abajo: siempre las mismas tres secciones.
function menuVehiculo(a, tab, pendientes) {
  const item = (k, ic, label) =>
    h(
      'button',
      {
        type: 'button',
        'aria-current': tab === k ? 'page' : null,
        onclick: () => tab !== k && go(`/auto/${a.id}/${k}`, { replace: true }),
      },
      h(
        'span',
        { class: 'ic' },
        icon(ic),
        k === 'reparacion' && pendientes
          ? h('span', { class: 'badge', 'aria-label': pendientes === 1 ? '1 pendiente' : `${pendientes} pendientes` }, pendientes)
          : null,
      ),
      label,
    );
  return h(
    'nav',
    { class: 'menu-veh', 'aria-label': 'Secciones del vehículo' },
    item('diagnostico', 'clipboard', 'Diagnóstico'),
    item('reparacion', 'wrench', 'Reparación'),
    item('historial', 'history', 'Historial'),
  );
}

function seccionDiagnostico(a, diagId) {
  const d = diagId ? S.getDiag(diagId) : S.diagsDe(a.id)[0];
  if (d && d.autoId === a.id) return editorPartes(d, a);
  if (diagId) return null;
  return {
    cuerpo: h(
      'div',
      { class: 'sec vacio-sec' },
      h('h2', null, 'Todavía no hay diagnósticos'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: () => {
            const nd = S.nuevoDiag(a.id);
            go(`/auto/${a.id}/diagnostico/${nd.id}`, { replace: true });
          },
        },
        icon('add'),
        'Crear diagnóstico',
      ),
    ),
  };
}

// "de hoy", "del 19 nov" (la última visita) o "desde el 12 mar" (una visita anterior).
function origen(diag, ultimo) {
  if (S.isoLocal(diag.fecha) === S.isoLocal(Date.now())) return 'de hoy';
  return diag === ultimo ? `del ${S.fmtFecha(diag.fecha)}` : `desde el ${S.fmtFecha(diag.fecha)}`;
}

const cuandoHecho = (it) =>
  [S.isoLocal(it.resultadoFecha || 0) === S.isoLocal(Date.now()) ? 'Hoy' : S.fmtFecha(it.resultadoFecha), it.resultadoKm ? `${S.fmtKm(it.resultadoKm)} km` : null]
    .filter(Boolean)
    .join(' · ');

function seccionReparacion(a, pend) {
  const ultimo = S.diagsDe(a.id).find((d) => !S.vacio(d));
  const recientes = S.hechosRecientes(a.id);
  const falta = S.suma(pend.map((x) => x.it));
  const cobrado = S.suma(recientes.map((x) => x.it));
  const deshacer = (it) => {
    it.resultado = null;
    it.resultadoFecha = null;
    it.resultadoKm = null;
    S.save();
    refrescar();
  };
  const cuerpo = h(
    'div',
    { class: 'sec' },
    h('h1', { class: 'sec-titulo' }, 'Reparación'),
    h(
      'div',
      { class: 'sec-head' },
      h('h2', { class: 'sec-sub' }, 'Para hacer'),
      pend.length ? h('small', null, [pend.length, falta ? S.fmtPrecio(falta) : null].filter(Boolean).join(' · ')) : null,
    ),
    pend.length
      ? [
          pend.map(({ it, diag }) =>
            h(
              'div',
              { class: 'pend', 'data-estado': it.estado },
              h('i', { class: 'dot' }),
              h(
                'div',
                { class: 'pend-texto' },
                h('b', null, it.texto.trim()),
                h(
                  'small',
                  null,
                  h('em', null, S.ESTADO_LABEL[it.estado]),
                  [it.precio ? S.fmtPrecio(it.precio) : null, origen(diag, ultimo)].filter(Boolean).map((t) => ` · ${t}`).join(''),
                ),
              ),
              h('button', { class: 'btn-hecho', type: 'button', onclick: () => marcarHecho(a, it, diag, ultimo) }, icon('check'), 'Hecho'),
            ),
          ),
        ]
      : h('p', { class: 'vacio-sec' }, recientes.length ? 'No queda nada pendiente. ¡Todo hecho!' : 'No hay arreglos pendientes.'),
    recientes.length
      ? [
          h('h2', { class: 'sec-sub' }, 'Hecho'),
          recientes.map(({ it }) =>
            h(
              'div',
              { class: 'hecho-card' },
              h('span', { class: 'tilde', 'aria-hidden': 'true' }, icon('check')),
              h(
                'div',
                { class: 'pend-texto' },
                h('b', null, it.texto.trim()),
                h('small', null, [cuandoHecho(it), it.precio ? S.fmtPrecio(it.precio) : null].filter(Boolean).join(' · ')),
              ),
              h('button', { class: 'btn-text', type: 'button', onclick: () => deshacer(it) }, 'Deshacer'),
            ),
          ),
        ]
      : null,
  );
  const abajo =
    recientes.length || falta
      ? h(
          'div',
          { class: 'envio' },
          cobrado || falta
            ? h(
                'div',
                { class: 'envio-total' },
                recientes.length ? h('span', { class: 'hecho' }, 'Hecho: ', h('b', null, S.fmtPrecio(cobrado))) : h('span'),
                falta ? h('span', { class: 'queda' }, 'Falta: ', h('b', null, S.fmtPrecio(falta))) : null,
              )
            : null,
          recientes.length
            ? h(
                'div',
                { class: 'envio-botones' },
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => enviarResumen(a) }, icon('wa'), 'Enviar resumen de lo arreglado'),
              )
            : null,
        )
      : null;
  return { cuerpo, abajo };
}

// Al terminar un arreglo: la fecha, el kilometraje y lo que se cobró.
function marcarHecho(a, it, diag, ultimo) {
  const hoy = Date.now();
  let fecha = hoy;
  const otraFecha = h('input', {
    class: 'input',
    type: 'date',
    max: S.isoLocal(hoy),
    hidden: true,
    'aria-label': 'Fecha del arreglo',
    onchange: (e) => {
      const [y, m, dd] = e.target.value.split('-').map(Number);
      if (y) fecha = new Date(y, m - 1, dd, 12).getTime();
    },
  });
  const opciones = h('div', { class: 'chips-fecha', role: 'radiogroup', 'aria-label': 'Fecha del arreglo' });
  const pintarFechas = (elegida) =>
    fill(
      opciones,
      [
        ['hoy', `Hoy, ${S.fmtFecha(hoy)}`, hoy],
        ['ayer', 'Ayer', hoy - 864e5],
        ['otra', 'Otra fecha', null],
      ].map(([k, label, ts]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(elegida === k),
            onclick: () => {
              otraFecha.hidden = k !== 'otra';
              if (ts) fecha = ts;
              else otraFecha.focus();
              pintarFechas(k);
            },
          },
          label,
        ),
      ),
    );
  pintarFechas('hoy');
  const km = input({ inputmode: 'numeric', value: S.fmtKm(S.ultimoKm(a.id)), placeholder: '0', 'aria-label': 'Kilometraje' });
  km.addEventListener('input', () => {
    const n = parseInt(km.value.replace(/\D/g, ''), 10);
    km.value = Number.isFinite(n) && n > 0 ? S.fmtKm(n) : '';
  });
  const precio = input({
    inputmode: 'numeric',
    value: it.precio ? Number(it.precio).toLocaleString('es-AR') : '',
    placeholder: 'Opcional',
    'aria-label': 'Precio cobrado',
  });
  precio.addEventListener('input', () => {
    const n = parseInt(precio.value.replace(/\D/g, ''), 10);
    precio.value = Number.isFinite(n) && n > 0 ? n.toLocaleString('es-AR') : '';
  });
  hoja(
    'Marcar como hecho',
    [
      h(
        'div',
        { class: 'pend', 'data-estado': it.estado },
        h('i', { class: 'dot' }),
        h('div', { class: 'pend-texto' }, h('b', null, it.texto.trim()), h('small', null, h('em', null, S.ESTADO_LABEL[it.estado]), ` · ${origen(diag, ultimo)}`)),
      ),
      h('div', { class: 'field' }, h('span', null, 'Fecha del arreglo'), opciones, otraFecha),
      h('div', { class: 'fields-row' }, field('Kilometraje', km), field('Precio cobrado ($)', precio)),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, icon('check'), 'Guardar como hecho'),
      h('button', { class: 'btn btn-ghost block', type: 'button', onclick: () => cerrarCapa() }, 'Cancelar'),
    ],
    {
      onSubmit: () => {
        const nKm = parseInt(km.value.replace(/\D/g, ''), 10);
        const nPrecio = parseInt(precio.value.replace(/\D/g, ''), 10);
        it.resultado = 'hecho';
        it.resultadoFecha = fecha;
        it.resultadoKm = Number.isFinite(nKm) && nKm > 0 ? nKm : null;
        if (Number.isFinite(nPrecio) && nPrecio > 0) it.precio = nPrecio;
        S.save();
        cerrarCapa(() => {
          refrescar();
          snack(`Hecho: ${it.texto.trim()}`, 'Deshacer', () => {
            it.resultado = null;
            it.resultadoFecha = null;
            it.resultadoKm = null;
            S.save();
            refrescar();
          });
        });
      },
    },
  );
}

function seccionHistorial(a) {
  const diags = S.diagsDe(a.id).filter((d) => !S.vacio(d));
  const hechos = S.hechosAuto(a.id);
  const anioAprox = !a.anio && a.patente ? S.anioPorPatente(a.patente) : null;

  // Línea de tiempo: cada día con su kilometraje, lo arreglado y los diagnósticos.
  const dias = new Map();
  const dia = (ts) => {
    const k = S.isoLocal(ts);
    if (!dias.has(k)) dias.set(k, { ts, km: 0, hechos: [], diags: [] });
    return dias.get(k);
  };
  for (const x of hechos) {
    const g = dia(x.it.resultadoFecha || x.diag.fecha);
    g.hechos.push(x.it);
    g.km = Math.max(g.km, x.it.resultadoKm || 0);
  }
  for (const d of diags) {
    const g = dia(d.fecha);
    g.diags.push(d);
    g.km = Math.max(g.km, d.km || 0);
  }
  const grupos = [...dias.values()].sort((x, y) => y.ts - x.ts);
  const titulo = (ts) => {
    const k = S.isoLocal(ts);
    if (k === S.isoLocal(Date.now())) return `Hoy, ${S.fmtFecha(ts, true)}`;
    if (k === S.isoLocal(Date.now() - 864e5)) return `Ayer, ${S.fmtFecha(ts, true)}`;
    return S.fmtFecha(ts, true);
  };
  const abrirDiag = (d) => go(`/auto/${a.id}/diagnostico/${d.id}`, { replace: true });

  return {
    cuerpo: h(
      'div',
      { class: 'sec' },
      h(
        'div',
        { class: 'sec-head' },
        h('h1', { class: 'sec-titulo' }, 'Historial clínico'),
        grupos.length
          ? h(
              'small',
              null,
              [
                diags.length === 1 ? '1 diagnóstico' : `${diags.length} diagnósticos`,
                hechos.length === 1 ? '1 arreglo' : `${hechos.length} arreglos`,
              ].join(' · '),
            )
          : null,
      ),
      grupos.length
        ? h(
            'div',
            { class: 'linea-tiempo' },
            grupos.map((g) =>
              h(
                'div',
                { class: 'dia' },
                h('span', { class: 'dia-marca', 'aria-hidden': 'true' }),
                h(
                  'div',
                  { class: 'dia-cuerpo' },
                  h('div', { class: 'dia-cab' }, h('b', null, titulo(g.ts)), g.km ? h('span', null, `${S.fmtKm(g.km)} km`) : null),
                  g.hechos.map((it) =>
                    h(
                      'div',
                      { class: 'evento' },
                      h('span', { class: 'tilde', 'aria-hidden': 'true' }, icon('check')),
                      h('span', { class: 'evento-texto' }, h('b', null, it.texto.trim()), h('small', null, 'Arreglo hecho')),
                      it.precio ? h('span', { class: 'evento-der' }, S.fmtPrecio(it.precio)) : null,
                    ),
                  ),
                  g.diags.map((d) => {
                    const n = d.items.filter((i) => i.texto.trim()).length;
                    const total = S.suma(d.items.filter((i) => i.texto.trim()));
                    return h(
                      'button',
                      { class: 'evento', type: 'button', onclick: () => abrirDiag(d) },
                      h('span', { class: 'ic-diag', 'aria-hidden': 'true' }, icon('clipboard')),
                      h(
                        'span',
                        { class: 'evento-texto' },
                        h('b', null, ['Diagnóstico', n === 1 ? '1 falla' : `${n} fallas`, total ? S.fmtPrecio(total) : null].filter(Boolean).join(' · ')),
                        h('small', null, d.enviado ? 'Enviado por WhatsApp' : 'Sin enviar'),
                      ),
                      h('span', { class: 'evento-der link' }, 'Abrir'),
                    );
                  }),
                ),
              ),
            ),
          )
        : h('p', { class: 'vacio-sec' }, 'Todavía no hay diagnósticos ni arreglos.'),
      anioAprox
        ? h(
            'p',
            { class: 'hero-anio' },
            `Año aproximado: ${anioAprox}, según la patente`,
            h(
              'button',
              {
                class: 'btn-text',
                type: 'button',
                onclick: () => {
                  a.anio = String(anioAprox);
                  S.save();
                  refrescar();
                  snack(`Año ${anioAprox} guardado`);
                },
              },
              'Confirmar año',
            ),
          )
        : null,
    ),
  };
}

// ---------- Resumen de lo arreglado (lo que se le manda al cliente al entregar el vehículo)

function datosResumen(a) {
  const hechos = S.hechosRecientes(a.id);
  if (!hechos.length) return null;
  // Lo pendiente va como pendiente, aunque antes se haya marcado "para después" o "no quiso".
  const pend = S.pendientesAuto(a.id).map((x) => ({ ...x.it, resultado: null }));
  const items = [...hechos.map((x) => x.it), ...pend];
  const fecha = Math.max(...hechos.map((x) => x.it.resultadoFecha || 0));
  const km = Math.max(0, ...hechos.map((x) => x.it.resultadoKm || 0)) || S.ultimoKm(a.id);
  return {
    taller: S.db.taller,
    logo: logoImg,
    auto: a,
    cliente: S.getCliente(a.clienteId),
    diag: { fecha, km, nota: '', items },
    modo: 'trabajo',
  };
}

function enviarResumen(a, formato = 'png') {
  document.activeElement?.blur?.();
  const datos = datosResumen(a);
  if (!datos) return snack('Marcá al menos un arreglo como hecho');
  const nombre = `Trabajo-realizado-${a.patente || 'vehiculo'}-${S.isoLocal(Date.now())}.${formato}`;
  const file = formato === 'pdf' ? archivoPDF(dibujarPDF(datos), nombre) : archivoPNG(dibujarReporte(datos), nombre);
  compartir(file, S.getCliente(a.clienteId)).then((r) => {
    if (!r) return;
    snack(r === 'compartido' ? 'Resumen enviado' : 'Imagen descargada. Adjuntala en el chat del cliente.');
  });
}

// En el campo Año se sugiere el que corresponde a la patente (se ve como ejemplo, no se guarda solo).
function sugerirAnio(pat, an) {
  const poner = () => {
    const x = S.anioPorPatente(pat.value);
    an.placeholder = x ? `≈ ${x}` : '';
    an.title = x ? `Según la patente, aproximadamente ${x}` : '';
  };
  pat.addEventListener('input', poner);
  poner();
}

// Vehículo y cliente en una sola hoja. Todo es opcional: se completa cuando se tiene.
function editarDatos(a, foco = null) {
  refrescarListas();
  const c = S.getCliente(a.clienteId);
  const pat = input({ value: S.fmtPatente(a.patente), autocapitalize: 'characters', maxlength: '10', placeholder: 'Ej: AB 123 CD' });
  const mod = input({ value: a.modelo, autocapitalize: 'words', placeholder: 'Ej: Fiat Cronos' });
  const an = input({ value: a.anio, inputmode: 'numeric', maxlength: '4' });
  const nom = input({ value: c?.nombre, autocapitalize: 'words', placeholder: 'Ej: Martín Gómez', list: c ? null : 'dl-clientes' });
  const tel = input({ value: c?.telefono, type: 'tel', inputmode: 'tel', placeholder: 'Ej: 11 2345 6789' });
  sugerirAnio(pat, an);
  if (!c) completarTelefono(nom, tel);
  const campos = { patente: pat, modelo: mod, anio: an, cliente: nom, wa: tel };
  hoja(
    'Datos del vehículo',
    [
      h(
        'div',
        { class: 'fields' },
        field('Patente', pat),
        h('div', { class: 'fields-row' }, field('Marca y modelo', mod), field('Año', an, 'w-anio')),
      ),
      h('h3', { class: 'datos-sub' }, 'Cliente'),
      h('div', { class: 'fields' }, field('Nombre y apellido', nom), field('Número de WhatsApp', tel)),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar cambios'),
      h(
        'button',
        { class: 'btn-text danger', type: 'button', onclick: () => cerrarCapa(() => borrarAutoUI(a)) },
        'Eliminar vehículo',
      ),
    ],
    {
      onSubmit: () => {
        const p = S.normPatente(pat.value);
        if (p && S.db.autos.some((x) => x.patente === p && x.id !== a.id)) {
          sacudir(pat);
          return snack('Ya hay un vehículo con esa patente');
        }
        a.patente = p;
        a.modelo = mod.value.trim();
        a.anio = an.value.trim();
        const nombre = nom.value.trim();
        const telefono = tel.value.trim();
        if (c) {
          if (nombre || telefono) {
            c.nombre = nombre;
            c.telefono = telefono;
          }
        } else {
          const nuevo = S.clientePara({ nombre, telefono });
          if (nuevo) a.clienteId = nuevo.id;
        }
        S.save();
        cerrarCapa(refrescar);
      },
    },
  );
  // En el mismo toque que abrió la hoja, así sube el teclado (iOS incluido).
  campos[foco]?.focus({ preventScroll: true });
}

function borrarAutoUI(a) {
  confirmarBorrado({
    titulo: 'Eliminar vehículo',
    texto: 'Se borra con todo su historial, en todos tus dispositivos.',
    boton: 'Eliminar vehículo',
    alConfirmar: () => {
      const deshacer = S.borrarAuto(a.id);
      S.save();
      volver('/');
      snack('Vehículo eliminado', 'Deshacer', () => {
        deshacer();
        refrescar();
      });
    },
  });
}

// ---------- Ficha del cliente

function fichaCliente(id) {
  const c = S.getCliente(id);
  if (!c) return null;
  const autos = S.autosDe(c.id)
    .map((a) => ({ a, t: S.ultimaActividad(a) }))
    .sort((x, y) => y.t - x.t);
  const wa = S.waNumber(c.telefono);
  const tel = (c.telefono || '').replace(/[^\d+]/g, '');
  return h(
    'div',
    { class: 'screen ficha-cliente' },
    bar(backBtn('/'), barTitulo('Ficha del cliente'), iconBtn('edit', 'Editar cliente', () => editarCliente(c))),
    h(
      'section',
      { class: 'hero' },
      avatar(c, 'lg'),
      h('h1', null, c.nombre || 'Cliente sin nombre'),
      c.telefono ? h('p', null, c.telefono) : null,
      tel
        ? h(
            'div',
            { class: 'acciones' },
            wa
              ? h(
                  'a',
                  { class: 'btn btn-wa', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' },
                  icon('wa'),
                  'Abrir WhatsApp',
                )
              : null,
            h('a', { class: 'btn btn-gris', href: `tel:${tel}` }, icon('phone'), 'Llamar al cliente'),
          )
        : null,
    ),
    titulo('Vehículos del cliente'),
    h(
      'div',
      { class: 'autos' },
      autos.map(({ a, t }) => filaAuto(a, null, S.hace(t))),
      h(
        'button',
        { class: 'auto nueva', type: 'button', onclick: () => agregarAuto(c) },
        h('span', { class: 'auto-id' }, h('span', { class: 'avatar mas' }, icon('add'))),
        h('span', { class: 'auto-titulo' }, 'Agregar vehículo'),
      ),
    ),
  );
}

function agregarAuto(c) {
  const pat = input({ autocapitalize: 'characters', maxlength: '10', placeholder: 'Ej: AB 123 CD' });
  const mod = input({ autocapitalize: 'words', placeholder: 'Ej: Fiat Cronos' });
  const an = input({ inputmode: 'numeric', maxlength: '4' });
  sugerirAnio(pat, an);
  hoja(
    'Agregar vehículo',
    [
      h(
        'div',
        { class: 'fields' },
        field('Patente', pat),
        h('div', { class: 'fields-row' }, field('Marca y modelo', mod), field('Año', an, 'w-anio')),
      ),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar vehículo'),
    ],
    {
      foco: true,
      onSubmit: () => {
        const p = S.normPatente(pat.value);
        if (!p && !mod.value.trim()) return sacudir(pat);
        const existente = S.autoPorPatente(p);
        if (existente) existente.clienteId = c.id;
        else S.crearAuto({ patente: p, modelo: mod.value, anio: an.value, clienteId: c.id });
        S.save();
        cerrarCapa(refrescar);
      },
    },
  );
}

function editarCliente(c) {
  const nom = input({ value: c.nombre, autocapitalize: 'words' });
  const tel = input({ value: c.telefono, type: 'tel', inputmode: 'tel', placeholder: 'Ej: 11 2345 6789' });
  hoja(
    'Editar cliente',
    [
      h('div', { class: 'fields' }, field('Nombre y apellido', nom), field('Número de WhatsApp', tel)),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar cambios'),
      h(
        'button',
        {
          class: 'btn-text danger',
          type: 'button',
          onclick: () =>
            cerrarCapa(() =>
              confirmarBorrado({
                titulo: 'Eliminar cliente',
                texto: 'Sus vehículos y su historial quedan guardados.',
                boton: 'Eliminar cliente',
                alConfirmar: () => {
                  const deshacer = S.borrarCliente(c.id);
                  S.save();
                  volver('/');
                  snack('Cliente eliminado', 'Deshacer', () => {
                    deshacer();
                    refrescar();
                  });
                },
              }),
            ),
        },
        'Eliminar cliente',
      ),
    ],
    {
      onSubmit: () => {
        if (!nom.value.trim() && !tel.value.trim()) return sacudir(nom);
        c.nombre = nom.value.trim();
        c.telefono = tel.value.trim();
        S.save();
        cerrarCapa(refrescar);
      },
    },
  );
}

// ---------- Ajustes

// El logo se guarda con su forma (no se recorta cuadrado) y con fondo transparente.
async function logoDesde(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, 640 / img.naturalWidth, 320 / img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Elegir el logo desde cualquier pantalla (Ajustes o la vista previa).
function elegirLogo(luego) {
  const inp = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      inp.remove();
      if (!f || !S.db.taller) return;
      try {
        S.db.taller.logo = await logoDesde(f);
        S.save();
        await cargarLogo();
        luego?.();
        snack('Logo guardado. Ya aparece en los presupuestos.');
      } catch {
        snack('No se pudo usar esa imagen');
      }
    },
  });
  document.body.append(inp);
  inp.click();
}

function exportar() {
  const file = new File([S.snapshot()], `copia-taller-${S.isoLocal(Date.now())}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
  else descargar(file);
}

function ajustes() {
  const t = S.db.taller;
  const set = (k) => (e) => {
    t[k] = e.target.value.trim();
    S.save();
  };
  const nombre = input({
    value: t.nombre,
    autocapitalize: 'words',
    oninput: (e) => {
      if (!e.target.value.trim()) return;
      t.nombre = e.target.value.trim();
      S.save();
    },
    onblur: (e) => {
      e.target.value = t.nombre;
    },
  });
  const tel = input({ value: t.telefono, type: 'tel', inputmode: 'tel', placeholder: 'Opcional', oninput: set('telefono') });
  const dir = input({ value: t.direccion, autocapitalize: 'sentences', placeholder: 'Opcional', oninput: set('direccion') });

  return h(
    'div',
    { class: 'screen angosta' },
    bar(backBtn('/'), barTitulo('Ajustes del taller'), hueco()),
    titulo('Datos del taller'),
    h(
      'div',
      { class: 'pad logo-bloque' },
      h(
        'button',
        { class: `logo-zona${t.logo ? ' con-logo' : ''}`, type: 'button', onclick: () => elegirLogo(refrescar) },
        t.logo ? h('img', { src: t.logo, alt: 'Logo del taller' }) : [icon('image'), h('span', null, 'Subir el logo del taller')],
      ),
      h(
        'div',
        { class: 'logo-pie' },
        h('span'),
        t.logo
          ? h(
              'span',
              { class: 'logo-botones' },
              h('button', { class: 'btn-text', type: 'button', onclick: () => elegirLogo(refrescar) }, 'Cambiar logo'),
              h(
                'button',
                {
                  class: 'btn-text danger',
                  type: 'button',
                  onclick: () => {
                    t.logo = null;
                    S.save();
                    cargarLogo();
                    refrescar();
                  },
                },
                'Quitar logo',
              ),
            )
          : null,
      ),
    ),
    h('div', { class: 'fields pad' }, field('Nombre del taller', nombre), field('WhatsApp del taller', tel), field('Dirección', dir)),
    titulo('Avisos'),
    filaAvisos(),
    titulo('Cuenta'),
    h(
      'div',
      { class: 'card' },
      S.sync.email
        ? h(
            'div',
            { class: 'row' },
            h('span', { class: 'avatar mas' }, icon('check')),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, S.sync.email), h('span', { class: 'row-sub' }, 'Email de la cuenta')),
          )
        : h(
            'button',
            { class: 'row', type: 'button', onclick: ingresarConEmailHoja },
            h('span', { class: 'avatar mas' }, icon('add')),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Ingresar con email')),
            h('span', { class: 'go' }, icon('chevron')),
          ),
    ),
    titulo('Usar en otros dispositivos'),
    estadoNube('pad'),
    h(
      'div',
      { class: 'card' },
      h(
        'button',
        { class: 'row', type: 'button', onclick: vincularOtro },
        h('span', { class: 'avatar mas' }, icon('qr')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Conectar otro dispositivo')),
        h('span', { class: 'go' }, icon('chevron')),
      ),
      h(
        'button',
        { class: 'row', type: 'button', onclick: tengoCodigo },
        h('span', { class: 'avatar mas' }, icon('teclado')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Ingresar código de conexión')),
        h('span', { class: 'go' }, icon('chevron')),
      ),
      h(
        'button',
        { class: 'row', type: 'button', onclick: verRecuperacion },
        h('span', { class: 'avatar mas' }, icon('llave')),
        h(
          'span',
          { class: 'row-main' },
          h('span', { class: 'row-title' }, 'Código de recuperación'),
          S.db.taller?.recuperacionGuardada ? null : h('span', { class: 'row-sub' }, 'Todavía no lo guardaste'),
        ),
        h('span', { class: 'go' }, icon('chevron')),
      ),
    ),
    titulo('Copia de seguridad'),
    h(
      'div',
      { class: 'acciones pad' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: exportar }, icon('download'), 'Descargar copia de los datos'),
    ),
  );
}

// ---------- Inicio

// Al tocar el link del mail se vuelve a la app con la sesión en la dirección.
function vueltaDelMail() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('access_token')) return { token: p.get('access_token') };
  if (p.get('error_code') || p.get('error')) return { error: true };
  return null;
}
const mail = vueltaDelMail();
if (mail) history.replaceState({ depth: 0 }, '', location.pathname + location.search + '#/');
if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || '#/');
render();
if (mail?.token) {
  app.replaceChildren(pantallaCentro(h('h1', null, 'Entrando…')));
  Sync.entrarConSesion(mail.token)
    .then(() => {
      render();
      snack('Listo. Ya estás en tu taller.');
    })
    .catch(() => {
      render();
      snack('No se pudo entrar. Pedí otro mail.');
    });
} else if (mail?.error) snack('El link venció o ya se usó. Pedí otro.');

// Si llega algo del otro dispositivo, se ve al toque (salvo que estén escribiendo).
let refrescoPendiente = false;
const escribiendo = () => document.activeElement?.matches?.('input, textarea');
Sync.iniciar(() => {
  cargarLogo();
  if (capa || escribiendo()) refrescoPendiente = true;
  else render({ mantener: true });
});
document.addEventListener('focusout', () =>
  setTimeout(() => {
    if (refrescoPendiente && !capa && !escribiendo()) {
      refrescoPendiente = false;
      render({ mantener: true });
    }
  }, 300),
);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
