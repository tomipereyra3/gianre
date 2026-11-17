import * as S from './store.js';
import { h, fill, icon, plate, avatar, field, input, autosize, snack, cerrarSnackViejo, menu } from './ui.js';
import { dibujarReporte, archivoPNG, archivoPDF, FUENTES } from './report.js';

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
  if (rutaActual) scrolls[rutaActual] = scrollY;
  const y = mantener ? scrollY : pop ? scrolls[ruta()] || 0 : 0;
  if (!mantener) cerrarSnackViejo();
  quitarCapa();
  salir?.();
  salir = null;
  rutaActual = ruta();
  let el = null;
  if (!S.db.taller) el = bienvenida();
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

function filaAuto(a, c, cuando, onclick) {
  const pend = S.pendientes(a.id).items;
  const urgente = pend.some((i) => i.estado === 'urgente');
  const nombre = S.nombreAuto(a);
  const sub = [nombre ? c?.nombre : null, cuando].filter(Boolean).join(' · ');
  return h(
    'button',
    { class: 'row', type: 'button', onclick: onclick || (() => go('/auto/' + a.id)) },
    plate(a.patente),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, nombre || c?.nombre || 'Auto'),
      sub ? h('span', { class: 'row-sub' }, sub) : null,
    ),
    pend.length
      ? h(
          'span',
          {
            class: `pend ${urgente ? 'urgente' : 'pronto'}`,
            title: pend.length === 1 ? '1 pendiente' : `${pend.length} pendientes`,
          },
          h('i'),
          pend.length,
        )
      : null,
  );
}

// ---------- Bienvenida

function bienvenida() {
  const nombre = input({ placeholder: 'Ej: Taller Rodríguez', autocapitalize: 'words', enterkeyhint: 'next' });
  const tel = input({ type: 'tel', inputmode: 'tel', placeholder: 'Opcional', enterkeyhint: 'done' });
  const empezar = () => {
    const n = nombre.value.trim();
    if (!n) {
      nombre.focus();
      return sacudir(nombre);
    }
    S.db.taller = { nombre: n, telefono: tel.value.trim(), direccion: '', logo: null };
    S.save();
    history.replaceState({ depth: 0 }, '', '#/');
    render();
  };
  enterPasaA(nombre, tel);
  enterPasaA(tel, empezar);
  requestAnimationFrame(() => nombre.focus());
  return h(
    'div',
    { class: 'screen bienvenida' },
    h(
      'div',
      { class: 'bienvenida-body' },
      marca(),
      h('h1', null, '¿Cómo se llama tu taller?'),
      h('p', { class: 'lead' }, 'Va a aparecer en cada diagnóstico que mandes.'),
      h('div', { class: 'fields' }, field('Nombre del taller', nombre), field('WhatsApp del taller', tel)),
    ),
    h('div', { class: 'bottombar' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: empezar }, 'Empezar')),
  );
}

// ---------- Inicio

let busqueda = '';

function inicio() {
  const t = S.db.taller;
  const lista = h('div', { class: 'list' });
  const dibujar = () => {
    if (!S.db.autos.length) return lista.replaceChildren(vacioInicio());
    const res = S.buscarAutos(busqueda);
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

// ---------- Nuevo diagnóstico: elegir o cargar el auto

function nuevo() {
  refrescarListas();
  let q = '';
  const resultados = h('div');
  const modelo = input({ placeholder: 'Ej: Fiat Cronos', autocapitalize: 'words', enterkeyhint: 'next' });
  const anio = input({ inputmode: 'numeric', maxlength: '4', enterkeyhint: 'next' });
  const nombre = input({ placeholder: 'Nombre', autocapitalize: 'words', list: 'dl-clientes', enterkeyhint: 'next' });
  const tel = input({ type: 'tel', inputmode: 'tel', placeholder: 'Ej: 11 2345 6789', enterkeyhint: 'done' });
  completarTelefono(nombre, tel);

  const formulario = h(
    'div',
    { class: 'nuevo-form', hidden: true },
    titulo('Auto nuevo'),
    h(
      'div',
      { class: 'fields pad' },
      h('div', { class: 'fields-row' }, field('Marca y modelo', modelo), field('Año', anio, 'w-anio')),
      field('Cliente', nombre),
      field('WhatsApp', tel),
    ),
  );
  const cta = h(
    'div',
    { class: 'bottombar', hidden: true },
    h('button', { class: 'btn btn-primary', type: 'button', onclick: crear }, 'Continuar'),
  );

  const patente = h('input', {
    placeholder: 'Patente',
    maxlength: '10',
    autocapitalize: 'characters',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'next',
    'aria-label': 'Patente',
    oninput: (e) => {
      q = e.target.value;
      // Al completar la patente, se acomoda sola: AD 482 KJ / ABC 123.
      const f = S.fmtPatente(q);
      if (f.includes(' ') && f !== q && e.target.selectionStart === q.length) e.target.value = f;
      actualizar();
    },
  });
  enterPasaA(patente, () => {
    const ex = S.autoPorPatente(q);
    if (ex) empezarCon(ex);
    else if (!formulario.hidden) modelo.focus();
  });
  enterPasaA(modelo, anio);
  enterPasaA(anio, nombre);
  enterPasaA(nombre, tel);
  enterPasaA(tel, crear);

  function actualizar() {
    const qp = S.normPatente(q);
    const exacto = S.autoPorPatente(qp);
    const matches = S.buscarAutos(q).slice(0, 5);
    fill(resultados,
      !qp && matches.length ? titulo('Recientes') : null,
      matches.length
        ? h(
            'div',
            { class: 'card' },
            matches.map(({ a, c, t }) => filaAuto(a, c, S.hace(t), () => empezarCon(a))),
          )
        : null,
    );
    // Mientras haya coincidencias, el formulario espera a que la patente esté completa.
    formulario.hidden = !(qp.length >= 2 && !exacto && (!matches.length || qp.length >= 6));
    cta.hidden = formulario.hidden;
  }

  function empezarCon(a) {
    const d = S.nuevoDiag(a.id);
    go('/diag/' + d.id, { replace: true });
  }

  function crear() {
    const qp = S.normPatente(q);
    if (qp.length < 2) return patente.focus();
    const c = S.clientePara({ nombre: nombre.value, telefono: tel.value });
    const a = S.crearAuto({ patente: qp, modelo: modelo.value, anio: anio.value, clienteId: c?.id ?? null });
    S.save();
    empezarCon(a);
  }

  actualizar();
  requestAnimationFrame(() => patente.focus());

  return h(
    'div',
    { class: 'screen' },
    bar(iconBtn('close', 'Cerrar', () => volver('/')), h('div', { class: 'bar-title' }, 'Nuevo diagnóstico')),
    h('div', { class: 'plate-input' }, patente),
    resultados,
    formulario,
    cta,
  );
}

// ---------- Diagnóstico

function editor(id) {
  const d = S.getDiag(id);
  const a = d && S.getAuto(d.autoId);
  if (!a) return null;
  const c = S.getCliente(a.clienteId);
  refrescarListas();
  salir = () => {
    if (S.vacio(d)) S.borrarDiag(d.id);
    S.save();
  };
  const guardar = () => S.save();

  // Tres grupos, como los ve el cliente.
  const secs = {};
  for (const [k, label] of S.ESTADOS) {
    const lista = h('div', { class: 'items' });
    const cuenta = h('span', { class: 'count' });
    const nuevoItem = h('input', {
      placeholder: 'Agregar',
      list: 'dl-items',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      enterkeyhint: 'enter',
      'aria-label': `Agregar a ${label}`,
      onblur: () => confirmar(k),
    });
    enterPasaA(nuevoItem, () => confirmar(k));
    const el = h(
      'section',
      { class: 'sec', 'data-estado': k },
      h('header', { class: 'sec-head' }, h('i', { class: 'dot' }), h('span', null, label), cuenta),
      lista,
      h('label', { class: 'add' }, h('span', { class: 'plus' }, icon('add')), nuevoItem),
    );
    secs[k] = { el, lista, cuenta, input: nuevoItem };
  }

  const filas = new Map();

  function confirmar(k) {
    const inp = secs[k].input;
    const v = inp.value.trim();
    if (!v) return;
    inp.value = '';
    agregar(k, v);
  }

  function agregar(k, texto) {
    const it = { id: S.uid(), texto, estado: k, hecho: null };
    d.items.push(it);
    guardar();
    secs[k].lista.append(filaItem(it, true));
    contar();
  }

  function contar() {
    for (const [k] of S.ESTADOS) {
      const n = d.items.filter((i) => i.estado === k).length;
      secs[k].cuenta.textContent = n || '';
    }
    mostrarBanner();
  }

  function ordenar(k) {
    for (const it of d.items) if (it.estado === k && filas.get(it.id)) secs[k].lista.append(filas.get(it.id));
  }

  function filaItem(it, animar = false) {
    // textarea de una línea que crece: los ítems largos se leen enteros.
    const txt = autosize(
      h('textarea', {
        rows: '1',
        value: it.texto,
        autocomplete: 'off',
        autocapitalize: 'sentences',
        enterkeyhint: 'done',
        'aria-label': 'Ítem',
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
    const dotBtn = h(
      'button',
      {
        class: 'dot-btn',
        type: 'button',
        'aria-label': 'Cambiar grupo',
        onclick: () =>
          menu(
            dotBtn,
            S.ESTADOS.map(([k, label]) => ({
              label,
              estado: k,
              checked: it.estado === k,
              onclick: () => mover(it, k),
            })),
          ),
      },
      h('i', { class: 'dot' }),
    );
    const row = h(
      'div',
      { class: `item${animar ? ' nuevo' : ''}` },
      dotBtn,
      txt,
      h('button', { class: 'x', type: 'button', 'aria-label': 'Quitar', onclick: () => quitar(it, true) }, icon('close')),
    );
    filas.set(it.id, row);
    return row;
  }

  function mover(it, k) {
    if (it.estado === k) return;
    it.estado = k;
    guardar();
    const row = filas.get(it.id);
    secs[k].lista.append(row);
    row.classList.remove('nuevo');
    void row.offsetWidth;
    row.classList.add('nuevo');
    contar();
  }

  function quitar(it, conDeshacer) {
    const i = d.items.indexOf(it);
    if (i < 0) return;
    d.items.splice(i, 1);
    guardar();
    filas.get(it.id)?.remove();
    contar();
    if (conDeshacer && it.texto.trim()) {
      snack(`Se quitó “${it.texto.trim()}”`, 'Deshacer', () => {
        d.items.splice(Math.min(i, d.items.length), 0, it);
        guardar();
        ordenar(it.estado);
        contar();
      });
    }
  }

  for (const it of d.items) secs[it.estado]?.lista.append(filaItem(it));

  // Lo que quedó pendiente de la visita anterior, a un toque.
  const anterior = S.pendientes(a.id, d.id);
  const bannerBox = h('div');
  function mostrarBanner() {
    const faltan = anterior.items.filter((p) => !d.items.some((i) => S.fold(i.texto) === S.fold(p.texto)));
    const ver = anterior.diag && anterior.diag.fecha < d.fecha && !d.arrastrado && !d.enviado && faltan.length;
    fill(bannerBox,
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
                  for (const p of faltan) agregar(p.estado, p.texto.trim());
                },
              },
              'Agregar',
            ),
          )
        : null,
    );
  }
  contar();

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

  function eliminar() {
    const tenia = !S.vacio(d);
    const snap = S.snapshot();
    S.borrarDiag(d.id);
    S.save();
    salir = null;
    volver('/auto/' + a.id);
    if (tenia)
      snack('Diagnóstico eliminado', 'Deshacer', () => {
        S.restore(snap);
        refrescar();
      });
  }

  const nombre = S.nombreAuto(a);
  return h(
    'div',
    { class: 'screen editor' },
    bar(
      backBtn('/auto/' + a.id),
      h(
        'div',
        { class: 'bar-id' },
        plate(a.patente, 'sm'),
        h(
          'div',
          { class: 'bar-id-text' },
          h('b', null, nombre || c?.nombre || 'Auto'),
          h('small', null, [nombre ? c?.nombre : null, S.fmtFecha(d.fecha)].filter(Boolean).join(' · ')),
        ),
      ),
      iconBtn('trash', 'Eliminar diagnóstico', eliminar),
    ),
    h('label', { class: 'km' }, h('span', null, 'Kilometraje'), km, h('span', { class: 'unit' }, 'km')),
    bannerBox,
    S.ESTADOS.map(([k]) => secs[k].el),
    h('div', { class: 'pad nota-box' }, nota),
    h(
      'div',
      { class: 'bottombar' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => verPrevia(d) }, icon('eye'), 'Ver'),
      h('button', { class: 'btn btn-wa', type: 'button', onclick: () => enviar(d, 'png') }, icon('wa'), 'Enviar por WhatsApp'),
    ),
  );
}

// ---------- Envío

const datosReporte = (d) => ({ taller: S.db.taller, logo: logoImg, auto: S.getAuto(d.autoId), diag: d });

function nombreArchivo(d, ext) {
  const a = S.getAuto(d.autoId);
  return `Diagnostico-${a?.patente || 'auto'}-${S.isoLocal(d.fecha)}.${ext}`;
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

function enviar(d, formato) {
  document.activeElement?.blur?.();
  if (S.vacio(d)) return snack('El diagnóstico está vacío');
  // Todo sincrónico hasta share(): Safari exige que siga "dentro" del toque.
  const cv = dibujarReporte(datosReporte(d));
  const file = formato === 'pdf' ? archivoPDF(cv, nombreArchivo(d, 'pdf')) : archivoPNG(cv, nombreArchivo(d, 'png'));
  const cliente = S.getCliente(S.getAuto(d.autoId)?.clienteId);
  compartir(file, cliente).then((r) => {
    if (!r) return;
    d.enviado = Date.now();
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
  const pend = S.pendientes(a.id);
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
      plate(a.patente, 'lg'),
      a.modelo ? h('h1', null, a.modelo) : null,
      detalle ? h('p', null, detalle) : null,
    ),
    cliente,
    pend.items.length ? [titulo('Pendientes'), h('div', { class: 'card' }, pend.items.map(filaPendiente))] : null,
    titulo('Historial'),
    diags.length
      ? h('div', { class: 'card' }, diags.map(filaHistorial))
      : h('p', { class: 'none' }, 'Sin diagnósticos todavía'),
    fab('Nuevo diagnóstico', () => {
      const d = S.nuevoDiag(a.id);
      go('/diag/' + d.id);
    }),
  );
}

function filaPendiente(it) {
  const row = h(
    'button',
    {
      class: 'row check-row',
      type: 'button',
      'data-estado': it.estado,
      onclick: () => {
        if (it.hecho) return;
        row.classList.add('on');
        it.hecho = Date.now();
        S.save();
        setTimeout(() => {
          refrescar();
          snack('Marcado como hecho', 'Deshacer', () => {
            it.hecho = null;
            S.save();
            refrescar();
          });
        }, 280);
      },
    },
    h('span', { class: 'check' }, icon('check')),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title wrap' }, it.texto.trim()),
      h('span', { class: 'row-sub estado' }, S.ESTADO_LABEL[it.estado]),
    ),
  );
  return row;
}

function filaHistorial(d) {
  const items = d.items.filter((i) => i.texto.trim());
  const n = (k) => items.filter((i) => i.estado === k).length;
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
        [d.km ? `${S.fmtKm(d.km)} km` : null, items.map((i) => i.texto.trim()).join(', ') || d.nota]
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
  const snap = S.snapshot();
  S.borrarAuto(a.id);
  S.save();
  volver('/');
  snack('Auto eliminado', 'Deshacer', () => {
    S.restore(snap);
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
              const snap = S.snapshot();
              S.borrarCliente(c.id);
              S.save();
              volver('/');
              snack('Cliente eliminado', 'Deshacer', () => {
                S.restore(snap);
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

async function importar(f) {
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!S.esCopiaValida(data)) throw new Error('copia');
    const snap = S.snapshot();
    S.restore({ ...data, taller: data.taller || S.db.taller });
    S.limpiarVacios();
    cargarLogo();
    refrescar();
    snack('Datos importados', 'Deshacer', () => {
      S.restore(snap);
      cargarLogo();
      refrescar();
    });
  } catch {
    snack('Ese archivo no es una copia válida');
  }
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
  const archivoCopia = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: (e) => importar(e.target.files[0]),
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
    titulo('Copia de seguridad'),
    h('p', { class: 'hint pad' }, 'Tus datos se guardan solo en este dispositivo.'),
    h(
      'div',
      { class: 'acciones pad' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: exportar }, icon('download'), 'Exportar'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => archivoCopia.click() }, icon('upload'), 'Importar'),
      archivoCopia,
    ),
  );
}

// ---------- Inicio

if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || '#/');
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
