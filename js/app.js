import * as S from './store.js';
import { h, fill, icon, plate, avatar, field, input, autosize, snack, cerrarSnackViejo } from './ui.js';
import { dibujarReporte, archivoPNG, archivoPDF, FUENTES } from './report.js';
import * as Sync from './sync.js';

const app = document.getElementById('app');

// ---------- Arranque

S.limpiarVacios();

let logoImg = null;
function cargarLogo() {
  const src = S.db.taller?.logo;
  logoImg = null;
  if (!src) return;
  logoImg = new Image();
  logoImg.src = src;
}
cargarLogo();

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
  [/^\/auto\/(\w+)$/, fichaAuto],
  [/^\/cliente\/(\w+)$/, fichaCliente],
  [/^\/diag\/(\w+)$/, editor],
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

// ---------- Piezas comunes

const bar = (...kids) => h('header', { class: 'bar' }, ...kids);
const iconBtn = (name, label, onclick) =>
  h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
const backBtn = (fallback) => iconBtn('back', 'Volver', () => volver(fallback));
const fab = (label, onclick) => h('button', { class: 'fab', type: 'button', onclick }, icon('add'), label);
const marca = (cls = '') => h('div', { class: `marca ${cls}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
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

// Un auto se reconoce por la patente; si no la cargaron, por el cliente.
const identidad = (a, c, size = '') =>
  a.patente ? plate(a.patente, size) : h('span', { class: `ident ${size}` }, avatar(c, size));

// Rojo/amarillo con cuántos trabajos faltan; verde cuando está al día.
function badgeSemaforo(luz) {
  if (luz.color === 'bien') return h('span', { class: 'pend bien', title: 'Al día' }, icon('check'));
  return h(
    'span',
    { class: `pend ${luz.color}`, title: luz.faltan === 1 ? 'Falta 1 trabajo' : `Faltan ${luz.faltan} trabajos` },
    h('i'),
    luz.faltan,
  );
}

const mayusculas = (t) => t.trim().replace(/(^|\s)(\p{L})/gu, (_, s, l) => s + l.toUpperCase());

function filaAuto(a, c, cuando, onclick) {
  const luz = S.semaforo(a.id);
  const principal = S.nombreAuto(a) || c?.nombre;
  const sub = principal ? [S.nombreAuto(a) ? c?.nombre : null, cuando].filter(Boolean).join(' · ') : '';
  return h(
    'button',
    { class: 'row', type: 'button', onclick: onclick || (() => go('/auto/' + a.id)) },
    identidad(a, c),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, principal || cuando.charAt(0).toUpperCase() + cuando.slice(1)),
      sub ? h('span', { class: 'row-sub' }, sub) : null,
    ),
    luz ? badgeSemaforo(luz) : null,
  );
}

// ---------- Bienvenida

// Un solo dato, una sola vez: el nombre que encabeza cada diagnóstico.
function bienvenida() {
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
      marca(),
      h('h1', null, '¿Cómo se llama tu taller?'),
      h('p', { class: 'lead' }, 'Va a aparecer en cada diagnóstico que mandes.'),
      nombre,
      h('button', { class: 'btn-text ya-uso', type: 'button', onclick: tengoCodigo }, 'Ya lo uso en otro dispositivo'),
    ),
    h('div', { class: 'bottombar' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: empezar }, 'Empezar')),
  );
}

// ---------- Compu y celular: vincular dispositivos

const TEXTO_NUBE = {
  ok: 'Guardado en la nube',
  subiendo: 'Guardando…',
  'sin-conexion': 'Sin señal: se guarda cuando vuelva',
  error: 'No se pudo guardar en la nube. Se reintenta solo.',
  apagado: 'Guardando…',
};
function estadoNube() {
  const el = h('p', { class: 'nube pad' });
  const pintar = (e) => {
    el.dataset.estado = e;
    fill(el, h('i'), TEXTO_NUBE[e] || '');
  };
  pintar(Sync.estado);
  Sync.alCambiarEstado((e) => el.isConnected && pintar(e));
  return el;
}

let vinculandoAhora = null;
function vinculando(codigo) {
  const texto = h('p', { class: 'lead' }, 'Conectando con tu taller…');
  // Si la pantalla se redibuja mientras conecta, no repetir el pedido.
  if (vinculandoAhora === codigo) return h('div', { class: 'screen bienvenida' }, h('div', { class: 'bienvenida-body' }, marca(), h('h1', null, 'Vinculando'), texto));
  vinculandoAhora = codigo;
  Sync.vincular(codigo)
    .finally(() => (vinculandoAhora = null))
    .then(() => {
      history.replaceState({ depth: 0 }, '', '#/');
      render();
      snack('Listo. Ya tenés los mismos datos.');
    })
    .catch(() => {
      fill(texto, 'El código venció o no es válido. Pedí uno nuevo en el otro dispositivo.');
      fill(
        acciones,
        h('button', { class: 'btn btn-primary', type: 'button', onclick: tengoCodigo }, 'Ingresar otro código'),
      );
    });
  const acciones = h('div', { class: 'bottombar' });
  return h(
    'div',
    { class: 'screen bienvenida' },
    h('div', { class: 'bienvenida-body' }, marca(), h('h1', null, 'Vinculando'), texto),
    acciones,
  );
}

function tengoCodigo() {
  const campo = input({
    class: 'input big codigo',
    placeholder: 'XXXX XXXX',
    maxlength: '9',
    autocapitalize: 'characters',
    autocorrect: 'off',
    enterkeyhint: 'go',
    'aria-label': 'Código',
  });
  const boton = h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Vincular');
  hoja(
    'Tengo un código',
    [
      h('p', { class: 'hint' }, 'Está en el otro dispositivo, en Ajustes → Vincular otro dispositivo.'),
      campo,
      boton,
    ],
    {
      foco: true,
      onSubmit: async () => {
        const c = campo.value.replace(/[^a-z0-9]/gi, '');
        if (c.length < 8) return sacudir(campo);
        boton.disabled = true;
        fill(boton, 'Vinculando…');
        try {
          await Sync.vincular(c);
          cerrarCapa(() => {
            history.replaceState({ depth: 0 }, '', '#/');
            render();
            snack('Listo. Ya tenés los mismos datos.');
          });
        } catch {
          boton.disabled = false;
          fill(boton, 'Vincular');
          sacudir(campo);
          snack(navigator.onLine === false ? 'Sin conexión. Probá con internet.' : 'Ese código venció o no es válido');
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
  svg.setAttribute('aria-label', 'Código QR para vincular');
  svg.innerHTML = `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#141414"/>`;
  return svg;
}

function vincularOtro() {
  const cuerpo = h('div', { class: 'vincular' }, h('p', { class: 'hint' }, 'Generando código…'));
  hoja('Vincular otro dispositivo', [cuerpo, h('button', { class: 'btn btn-ghost block', type: 'submit' }, 'Listo')], {
    onSubmit: () => cerrarCapa(),
  });
  Promise.all([Sync.pedirCodigo(), cargarQR()])
    .then(([codigo, qrcode]) => {
      const link = `${location.origin}${location.pathname}#/vincular/${codigo}`;
      fill(
        cuerpo,
        dibujarQR(qrcode, link),
        h('p', { class: 'vincular-paso' }, 'Escaneá con la cámara del celular'),
        h('p', { class: 'hint' }, 'En una compu: Ajustes → Tengo un código'),
        h('div', { class: 'codigo-grande' }, `${codigo.slice(0, 4)} ${codigo.slice(4)}`),
        h('p', { class: 'hint' }, 'Vence en 15 minutos.'),
      );
    })
    .catch(() =>
      fill(cuerpo, h('p', { class: 'hint' }, 'Necesitás internet para vincular. Probá de nuevo cuando haya señal.')),
    );
}

// ---------- Inicio

let busqueda = '';

function inicio() {
  const t = S.db.taller;
  const lista = h('div', { class: 'list' });
  const dibujar = () => {
    if (!S.db.autos.length) return lista.replaceChildren(vacioInicio());
    const res = S.buscarAutos(busqueda, { orden: 'semaforo' });
    lista.replaceChildren(
      ...(res.length
        ? res.map(({ a, c, t }) => filaAuto(a, c, S.hace(t)))
        : [h('p', { class: 'none' }, `Sin resultados para “${busqueda.trim()}”`)]),
    );
  };
  dibujar();
  const buscador = S.db.autos.length
    ? h(
        'div',
        { class: 'search' },
        h(
          'label',
          null,
          icon('search'),
          h('input', {
            type: 'search',
            value: busqueda,
            placeholder: 'Buscar patente o cliente',
            'aria-label': 'Buscar patente o cliente',
            autocomplete: 'off',
            spellcheck: 'false',
            enterkeyhint: 'search',
            oninput: (e) => {
              busqueda = e.target.value;
              dibujar();
            },
          }),
        ),
      )
    : null;
  return h(
    'div',
    { class: 'screen' },
    h('header', { class: 'home-head' }, h('h1', null, t.nombre), iconBtn('settings', 'Ajustes', () => go('/ajustes'))),
    buscador,
    lista,
    fab('Nuevo diagnóstico', () => go('/nuevo')),
  );
}

function vacioInicio() {
  return h(
    'div',
    { class: 'empty' },
    marca('grande'),
    h('h3', null, 'Todavía no hay autos'),
    h('p', null, 'Se guardan solos cuando hacés un diagnóstico.'),
  );
}

// ---------- Nuevo diagnóstico: un solo dato (patente o cliente) y a escribir

function nuevo() {
  let q = '';
  const resultados = h('div');

  const campo = h('input', {
    class: 'input big',
    placeholder: 'Patente o cliente',
    maxlength: '40',
    autocapitalize: 'words',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Patente o cliente',
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
    const nueva = puedeCrear ? filaNueva(t, esPatente, qp) : null;

    const filas = matches.map(({ a, c, t: ts }) => filaAuto(a, c, S.hace(ts), () => empezarCon(a)));
    primero = nuevoPrimero || !matches.length ? (puedeCrear ? crear : null) : () => empezarCon(matches[0].a);

    fill(
      resultados,
      !t && matches.length ? titulo('Recientes') : null,
      filas.length || nueva ? h('div', { class: 'card' }, nuevoPrimero ? [nueva, filas] : [filas, nueva]) : null,
    );
  }

  function filaNueva(t, esPatente, qp) {
    return h(
      'button',
      { class: 'row nueva', type: 'button', onclick: crear },
      esPatente ? plate(qp) : h('span', { class: 'ident' }, avatar({ nombre: t })),
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title' }, esPatente ? 'Auto nuevo' : mayusculas(t)),
        esPatente ? null : h('span', { class: 'row-sub' }, 'Cliente nuevo'),
      ),
      h('span', { class: 'go' }, icon('chevron')),
    );
  }

  function empezarCon(a) {
    const d = S.nuevoDiag(a.id);
    go('/diag/' + d.id, { replace: true });
  }

  function crear() {
    const t = q.trim();
    if (t.length < 2) return sacudir(campo);
    let a;
    if (S.parecePatente(t)) a = S.crearAuto({ patente: t });
    else a = S.crearAuto({ clienteId: S.clientePara({ nombre: mayusculas(t) }).id });
    S.save();
    empezarCon(a);
  }

  actualizar();
  enfocar = campo;

  return h(
    'div',
    { class: 'screen' },
    bar(iconBtn('close', 'Cerrar', () => volver('/')), h('div', { class: 'bar-title' }, 'Nuevo diagnóstico')),
    h('div', { class: 'pad campo-nuevo' }, campo),
    resultados,
  );
}

// ---------- Diagnóstico: se escribe como un mensaje de WhatsApp, una falla por renglón

function editor(id) {
  const d = S.getDiag(id);
  const a = d && S.getAuto(d.autoId);
  if (!a) return null;
  const c = S.getCliente(a.clienteId);
  refrescarListas();
  salir = () => {
    confirmar();
    if (S.vacio(d)) S.borrarDiag(d.id);
    S.save();
  };
  const guardar = () => S.save();
  const lista = h('div', { class: 'items' });
  const filas = new Map();

  const nuevoItem = h('input', {
    placeholder: 'Escribí una falla',
    list: 'dl-items',
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint: 'enter',
    'aria-label': 'Escribí una falla',
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
        'aria-label': 'Falla',
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
    // La prioridad cambia con un toque: Pronto → Urgente → Bien.
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
        // En el historial se ve qué pasó con cada falla.
        it.resultado
          ? h(
              'span',
              { class: `res-tag res-${it.resultado}` },
              `${S.RESULTADO_LABEL[it.resultado]}${it.resultadoFecha ? ` · ${S.fmtFecha(it.resultadoFecha)}` : ''}`,
            )
          : null,
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Quitar', onclick: () => quitar(it, true) }, icon('close')),
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
      snack(`Se quitó “${it.texto.trim()}”`, 'Deshacer', () => {
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

  // Lo que quedó pendiente de la visita anterior, a un toque.
  const anterior = S.pendientes(a.id, d.id);
  const bannerBox = h('div');
  function mostrarBanner() {
    const faltan = anterior.items.filter((p) => !d.items.some((i) => S.fold(i.texto) === S.fold(p.texto)));
    const ver = anterior.diag && anterior.diag.fecha < d.fecha && !d.arrastrado && !d.enviado && faltan.length;
    fill(
      bannerBox,
      ver
        ? h(
            'div',
            { class: 'banner' },
            h(
              'div',
              { class: 'banner-text' },
              h(
                'b',
                null,
                faltan.length === 1 ? '1 pendiente de la última visita' : `${faltan.length} pendientes de la última visita`,
              ),
              h('span', null, faltan.map((i) => i.texto.trim()).join(', ')),
            ),
            h(
              'button',
              {
                class: 'btn btn-sm',
                type: 'button',
                onclick: () => {
                  d.arrastrado = true;
                  for (const p of faltan) agregar(p.texto.trim(), p.estado, p.precio || null);
                },
              },
              'Agregar',
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
  const kmBox = h(
    'label',
    { class: 'km', hidden: !d.km },
    h('span', null, 'Kilometraje'),
    km,
    h('span', { class: 'unit' }, 'km'),
  );

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
    const tenia = !S.vacio(d);
    const deshacer = S.borrarDiag(d.id);
    S.save();
    salir = null;
    volver('/auto/' + a.id);
    if (tenia)
      snack('Diagnóstico eliminado', 'Deshacer', () => {
        deshacer();
        refrescar();
      });
  }

  // Precios: aparecen cuando el mecánico ya los averiguó (presupuesto).
  let conPrecios = !!d.precios || S.conPrecio(d.items);
  const totalBox = h('div', { class: 'total-fila' });
  function sumar() {
    const t = S.suma(d.items.filter((i) => i.texto.trim()));
    fill(totalBox, h('span', null, 'Total'), h('b', null, S.fmtPrecio(t)));
    totalBox.hidden = !conPrecios || !t;
  }
  sumar();
  function activarPrecios() {
    if (conPrecios) return;
    conPrecios = d.precios = true;
    guardar();
    pantalla.classList.add('con-precios');
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
    'Precios',
  );

  // Diagnóstico nuevo: el teclado ya abierto, listo para escribir.
  if (!d.items.length) enfocar = nuevoItem;

  const nombre = S.nombreAuto(a);
  const pantalla = h(
    'div',
    { class: `screen editor${conPrecios ? ' con-precios' : ''}` },
    bar(
      backBtn('/auto/' + a.id),
      h(
        'div',
        { class: 'bar-id' },
        identidad(a, c, 'sm'),
        h(
          'div',
          { class: 'bar-id-text' },
          h('b', null, nombre || c?.nombre || 'Diagnóstico'),
          h('small', null, [nombre ? c?.nombre : null, S.fmtFecha(d.fecha)].filter(Boolean).join(' · ')),
        ),
      ),
      iconBtn('trash', 'Eliminar diagnóstico', eliminar),
    ),
    bannerBox,
    h(
      'section',
      { class: 'lista-fallas' },
      lista,
      h('label', { class: 'add' }, h('span', { class: 'plus' }, icon('add')), nuevoItem),
    ),
    totalBox,
    h('div', { class: 'extras' }, btnPrecios, extra('Kilometraje', kmBox, km), extra('Nota', notaBox, nota)),
    kmBox,
    notaBox,
    h(
      'div',
      { class: 'bottombar' },
      h(
        'button',
        { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Ver cómo queda', title: 'Ver cómo queda', onclick: () => verPrevia(d) },
        icon('eye'),
      ),
      h('button', { class: 'btn btn-wa', type: 'button', onclick: () => enviar(d, 'png') }, icon('wa'), 'Enviar por WhatsApp'),
    ),
  );
  return pantalla;
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
  snack('Se borró en otro dispositivo');
  volver('/');
  return true;
}

function enviar(d, formato, modo = 'diagnostico') {
  document.activeElement?.blur?.();
  if (borradoEnOtro(d)) return;
  if (S.vacio(d)) return snack('El diagnóstico está vacío');
  // Todo sincrónico hasta share(): Safari exige que siga "dentro" del toque.
  const cv = dibujarReporte(datosReporte(d, modo));
  const nombre = nombreArchivo(d, formato, modo);
  const file = formato === 'pdf' ? archivoPDF(cv, nombre) : archivoPNG(cv, nombre);
  const cliente = S.getCliente(S.getAuto(d.autoId)?.clienteId);
  compartir(file, cliente).then((r) => {
    if (!r) return;
    if (modo === 'trabajo') d.trabajoEnviado = Date.now();
    else d.enviado = Date.now();
    S.save();
    const aviso = () =>
      snack(
        r === 'compartido'
          ? 'Enviado y guardado en el historial'
          : formato === 'pdf'
            ? 'PDF descargado. Adjuntalo en el chat.'
            : 'Imagen descargada. Adjuntala en el chat.',
      );
    capa ? cerrarCapa(aviso) : aviso();
  });
}

function verPrevia(d) {
  document.activeElement?.blur?.();
  if (borradoEnOtro(d)) return;
  if (S.vacio(d)) return snack('El diagnóstico está vacío');
  const cv = dibujarReporte(datosReporte(d));
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Diagnóstico como lo recibe el cliente');
  abrirCapa(
    h(
      'div',
      { class: 'layer viewer' },
      bar(iconBtn('close', 'Cerrar', () => cerrarCapa()), h('div', { class: 'bar-title' }, 'Vista previa')),
      h('div', { class: 'viewer-body' }, cv),
      h(
        'div',
        { class: 'bottombar' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => enviar(d, 'pdf') }, icon('pdf'), 'PDF'),
        h('button', { class: 'btn btn-wa', type: 'button', onclick: () => enviar(d, 'png') }, icon('wa'), 'Enviar por WhatsApp'),
      ),
    ),
  );
}

// ---------- Ficha del auto

function fichaAuto(id) {
  const a = S.getAuto(id);
  if (!a) return null;
  const c = S.getCliente(a.clienteId);
  const trab = S.trabajos(a.id);
  const diags = S.diagsDe(a.id).filter((d) => !S.vacio(d));
  const km = S.ultimoKm(a.id);
  const wa = S.waNumber(c?.telefono);
  const detalle = [a.anio, km ? `${S.fmtKm(km)} km` : null].filter(Boolean).join(' · ');

  const cliente = c
    ? h(
        'div',
        { class: 'card card-split' },
        h(
          'button',
          { class: 'row', type: 'button', onclick: () => go('/cliente/' + c.id) },
          avatar(c),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, c.nombre || 'Sin nombre'),
            c.telefono ? h('span', { class: 'row-sub' }, c.telefono) : null,
          ),
        ),
        wa
          ? h(
              'a',
              {
                class: 'icon-btn wa',
                href: `https://wa.me/${wa}`,
                target: '_blank',
                rel: 'noopener',
                'aria-label': 'Abrir chat de WhatsApp',
                title: 'Abrir chat',
              },
              icon('wa'),
            )
          : null,
      )
    : h(
        'div',
        { class: 'card' },
        h(
          'button',
          { class: 'row', type: 'button', onclick: () => asignarCliente(a) },
          h('span', { class: 'avatar mas' }, icon('add')),
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Agregar cliente')),
        ),
      );

  return h(
    'div',
    { class: 'screen' },
    bar(backBtn('/'), h('div', { class: 'bar-title' }), iconBtn('edit', 'Editar auto', () => editarAuto(a))),
    h(
      'section',
      { class: 'hero' },
      a.patente
        ? plate(a.patente, 'lg')
        : h('button', { class: 'plate lg falta', type: 'button', onclick: () => editarAuto(a) }, h('b', null, '+ Patente')),
      a.modelo ? h('h1', null, a.modelo) : null,
      detalle ? h('p', null, detalle) : null,
    ),
    cliente,
    // Checklist punto por punto, rojo primero. Cada falla termina en
    // Hecho, Después (queda para otra visita) o No quiso (el cliente no lo hizo).
    trab.items.length
      ? [
          h(
            'h2',
            { class: 'label label-row' },
            'Trabajos',
            h('span', { class: 'progreso' }, `${trab.cuenta.hecho} de ${trab.items.length} hechos`),
          ),
          h('div', { class: 'card trabajos' }, trab.items.map(filaTrabajo), totalesTrabajo(trab.items)),
          trab.cuenta.hecho || trab.cuenta.despues || trab.cuenta.no
            ? h(
                'div',
                { class: 'pad accion-trabajo' },
                h(
                  'button',
                  { class: 'btn btn-ghost block', type: 'button', onclick: () => enviar(trab.diag, 'png', 'trabajo') },
                  icon('wa'),
                  'Enviar trabajo realizado',
                ),
              )
            : null,
        ]
      : null,
    titulo('Historial clínico'),
    diags.length
      ? h('div', { class: 'card' }, diags.map(filaHistorial))
      : h('p', { class: 'none' }, 'Sin diagnósticos todavía'),
    fab('Nuevo diagnóstico', () => {
      const d = S.nuevoDiag(a.id);
      go('/diag/' + d.id);
    }),
  );
}

function filaTrabajo(it) {
  const marcar = (r) => {
    // Tocar de nuevo el que ya está marcado lo deja sin definir.
    it.resultado = it.resultado === r ? null : r;
    it.resultadoFecha = it.resultado ? Date.now() : null;
    S.save();
    refrescar();
  };
  const cuando = it.resultadoFecha ? ` · ${S.fmtFecha(it.resultadoFecha)}` : '';
  return h(
    'div',
    { class: `trabajo${it.resultado ? ` res-${it.resultado}` : ''}`, 'data-estado': it.estado },
    h(
      'div',
      { class: 'trabajo-top' },
      h('i', { class: 'dot' }),
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title wrap' }, it.texto.trim()),
        h(
          'span',
          { class: 'row-sub estado' },
          S.ESTADO_LABEL[it.estado],
          it.resultado ? h('span', { class: 'res-texto' }, ` · ${S.RESULTADO_LABEL[it.resultado]}${cuando}`) : null,
        ),
      ),
      it.precio ? h('span', { class: 'trabajo-precio' }, S.fmtPrecio(it.precio)) : null,
    ),
    h(
      'div',
      { class: 'resultados', role: 'group', 'aria-label': `Qué pasó con ${it.texto.trim()}` },
      S.RESULTADOS.map(([r, label]) =>
        h(
          'button',
          {
            class: `res res-${r}`,
            type: 'button',
            'aria-pressed': String(it.resultado === r),
            onclick: () => marcar(r),
          },
          r === 'hecho' ? icon('check') : null,
          label,
        ),
      ),
    ),
  );
}

// Plata: lo hecho y lo que queda (solo si cargaron precios).
function totalesTrabajo(items) {
  if (!S.conPrecio(items)) return null;
  const hechos = S.suma(items.filter(S.hecho));
  const quedan = S.suma(items.filter((i) => !S.hecho(i)));
  return h(
    'div',
    { class: 'totales' },
    h('span', null, 'Hecho ', h('b', null, S.fmtPrecio(hechos))),
    h('span', null, 'Queda ', h('b', null, S.fmtPrecio(quedan))),
  );
}

// "3 hechos · 1 después · 1 no quiso"
function textoResumen(cuenta) {
  return [
    cuenta.hecho ? `${cuenta.hecho} ${cuenta.hecho === 1 ? 'hecho' : 'hechos'}` : null,
    cuenta.despues ? `${cuenta.despues} para después` : null,
    cuenta.no ? `${cuenta.no} no quiso` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function filaHistorial(d) {
  const items = d.items.filter((i) => i.texto.trim());
  const n = (k) => items.filter((i) => i.estado === k).length;
  const resumen = textoResumen(S.resumen(S.aResolver(d)));
  const total = S.suma(items);
  return h(
    'button',
    { class: 'row hist', type: 'button', onclick: () => go('/diag/' + d.id) },
    h(
      'span',
      { class: 'row-main' },
      h(
        'span',
        { class: 'row-title' },
        S.fmtFecha(d.fecha, true),
        d.enviado ? null : h('span', { class: 'tag' }, 'Sin enviar'),
      ),
      h(
        'span',
        { class: 'row-sub' },
        [d.km ? `${S.fmtKm(d.km)} km` : null, resumen || items.map((i) => i.texto.trim()).join(', ') || d.nota, total ? S.fmtPrecio(total) : null]
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    h(
      'span',
      { class: 'counts' },
      S.ESTADOS.map(([k]) => (n(k) ? h('span', { 'data-estado': k }, h('i', { class: 'dot' }), n(k)) : null)),
    ),
  );
}

function editarAuto(a) {
  const pat = input({ value: S.fmtPatente(a.patente), autocapitalize: 'characters', maxlength: '10' });
  const mod = input({ value: a.modelo, autocapitalize: 'words', placeholder: 'Ej: Fiat Cronos' });
  const an = input({ value: a.anio, inputmode: 'numeric', maxlength: '4' });
  hoja(
    'Editar auto',
    [
      h(
        'div',
        { class: 'fields' },
        field('Patente', pat),
        h('div', { class: 'fields-row' }, field('Marca y modelo', mod), field('Año', an, 'w-anio')),
      ),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar'),
      h(
        'button',
        { class: 'btn-text danger', type: 'button', onclick: () => cerrarCapa(() => borrarAutoUI(a)) },
        'Eliminar auto',
      ),
    ],
    {
      onSubmit: () => {
        const p = S.normPatente(pat.value);
        if (p && S.db.autos.some((x) => x.patente === p && x.id !== a.id)) {
          sacudir(pat);
          return snack('Ya hay un auto con esa patente');
        }
        a.patente = p;
        a.modelo = mod.value.trim();
        a.anio = an.value.trim();
        S.save();
        cerrarCapa(refrescar);
      },
    },
  );
}

function borrarAutoUI(a) {
  const deshacer = S.borrarAuto(a.id);
  S.save();
  volver('/');
  snack('Auto eliminado', 'Deshacer', () => {
    deshacer();
    refrescar();
  });
}

function asignarCliente(a) {
  refrescarListas();
  const nom = input({ placeholder: 'Nombre', autocapitalize: 'words', list: 'dl-clientes' });
  const tel = input({ type: 'tel', inputmode: 'tel', placeholder: 'Ej: 11 2345 6789' });
  completarTelefono(nom, tel);
  hoja(
    'Cliente',
    [
      h('div', { class: 'fields' }, field('Nombre', nom), field('WhatsApp', tel)),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar'),
    ],
    {
      foco: true,
      onSubmit: () => {
        const c = S.clientePara({ nombre: nom.value, telefono: tel.value });
        if (!c) return sacudir(nom);
        a.clienteId = c.id;
        S.save();
        cerrarCapa(refrescar);
      },
    },
  );
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
    { class: 'screen' },
    bar(backBtn('/'), h('div', { class: 'bar-title' }), iconBtn('edit', 'Editar cliente', () => editarCliente(c))),
    h(
      'section',
      { class: 'hero' },
      avatar(c, 'lg'),
      h('h1', null, c.nombre || 'Sin nombre'),
      c.telefono ? h('p', null, c.telefono) : null,
      tel
        ? h(
            'div',
            { class: 'acciones' },
            wa
              ? h(
                  'a',
                  { class: 'btn btn-ghost', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' },
                  icon('wa'),
                  'WhatsApp',
                )
              : null,
            h('a', { class: 'btn btn-ghost', href: `tel:${tel}` }, icon('phone'), 'Llamar'),
          )
        : null,
    ),
    titulo(autos.length === 1 ? 'Auto' : 'Autos'),
    h(
      'div',
      { class: 'card' },
      autos.map(({ a, t }) => filaAuto(a, null, S.hace(t))),
      h(
        'button',
        { class: 'row', type: 'button', onclick: () => agregarAuto(c) },
        h('span', { class: 'avatar mas' }, icon('add')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Agregar auto')),
      ),
    ),
  );
}

function agregarAuto(c) {
  const pat = input({ autocapitalize: 'characters', maxlength: '10', placeholder: 'Ej: AB 123 CD' });
  const mod = input({ autocapitalize: 'words', placeholder: 'Ej: Fiat Cronos' });
  const an = input({ inputmode: 'numeric', maxlength: '4' });
  hoja(
    'Agregar auto',
    [
      h(
        'div',
        { class: 'fields' },
        field('Patente', pat),
        h('div', { class: 'fields-row' }, field('Marca y modelo', mod), field('Año', an, 'w-anio')),
      ),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar'),
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
      h('div', { class: 'fields' }, field('Nombre', nom), field('WhatsApp', tel)),
      h('button', { class: 'btn btn-primary block', type: 'submit' }, 'Guardar'),
      h(
        'button',
        {
          class: 'btn-text danger',
          type: 'button',
          onclick: () =>
            cerrarCapa(() => {
              const deshacer = S.borrarCliente(c.id);
              S.save();
              volver('/');
              snack('Cliente eliminado', 'Deshacer', () => {
                deshacer();
                refrescar();
              });
            }),
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

async function logoDesde(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, s, s);
    const k = Math.min(s / img.naturalWidth, s / img.naturalHeight);
    const w = img.naturalWidth * k;
    const hh = img.naturalHeight * k;
    ctx.drawImage(img, (s - w) / 2, (s - hh) / 2, w, hh);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
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

  const archivoLogo = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        t.logo = await logoDesde(f);
        S.save();
        cargarLogo();
        refrescar();
      } catch {
        snack('No se pudo usar esa imagen');
      }
    },
  });

  return h(
    'div',
    { class: 'screen' },
    bar(backBtn('/'), h('div', { class: 'bar-title' }, 'Ajustes')),
    titulo('Taller'),
    h(
      'div',
      { class: 'logo-row pad' },
      h(
        'button',
        { class: 'logo-box', type: 'button', 'aria-label': 'Elegir logo', onclick: () => archivoLogo.click() },
        t.logo ? h('img', { src: t.logo, alt: '' }) : icon('image'),
      ),
      h(
        'div',
        { class: 'logo-actions' },
        h(
          'button',
          { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => archivoLogo.click() },
          t.logo ? 'Cambiar logo' : 'Agregar logo',
        ),
        t.logo
          ? h(
              'button',
              {
                class: 'btn-text',
                type: 'button',
                onclick: () => {
                  t.logo = null;
                  S.save();
                  cargarLogo();
                  refrescar();
                },
              },
              'Quitar',
            )
          : null,
      ),
      archivoLogo,
    ),
    h('div', { class: 'fields pad' }, field('Nombre', nombre), field('WhatsApp', tel), field('Dirección', dir)),
    titulo('Compu y celular'),
    estadoNube(),
    h(
      'div',
      { class: 'card' },
      h(
        'button',
        { class: 'row', type: 'button', onclick: vincularOtro },
        h('span', { class: 'avatar mas' }, icon('qr')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Vincular otro dispositivo')),
        h('span', { class: 'go' }, icon('chevron')),
      ),
      h(
        'button',
        { class: 'row', type: 'button', onclick: tengoCodigo },
        h('span', { class: 'avatar mas' }, icon('teclado')),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Tengo un código')),
        h('span', { class: 'go' }, icon('chevron')),
      ),
    ),
    titulo('Copia de seguridad'),
    h(
      'div',
      { class: 'acciones pad' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: exportar }, icon('download'), 'Descargar copia'),
    ),
  );
}

// ---------- Inicio

if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || '#/');
render();

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
