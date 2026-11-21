import { fmtPatente, esPatenteVieja, iniciales } from './store.js';

// ---------- DOM

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

// Reemplaza el contenido ignorando null/false (replaceChildren los escribe como texto).
export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

// ---------- Íconos (Material Symbols, relleno)

const PATHS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  close:
    'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  search:
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  edit:
    'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  chevron: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  phone:
    'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.61 21 3 13.39 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  pdf: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z',
  qr: 'M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 19h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z',
  teclado:
    'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z',
  image:
    'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  wa: 'M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z',
};

const NS = 'http://www.w3.org/2000/svg';
export function icon(name) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `icon icon-${name}`);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[name]);
  s.append(p);
  return s;
}

// ---------- Piezas

export function plate(patente, size = '') {
  const txt = fmtPatente(patente);
  const cls = ['plate', size, esPatenteVieja(patente) ? 'old' : '', txt ? '' : 'none'].join(' ');
  return h('span', { class: cls }, h('b', null, txt || 'S/P'));
}

export function avatar(c, size = '') {
  return h('span', { class: `avatar ${size}` }, iniciales(c?.nombre) || icon('phone'));
}

export const field = (label, input, cls = '') => h('label', { class: `field ${cls}` }, h('span', null, label), input);

export const input = (props) =>
  h('input', { class: 'input', autocomplete: 'off', spellcheck: 'false', ...props });

export function autosize(t) {
  const fit = () => {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 'px';
  };
  t.addEventListener('input', fit);
  t.dataset.autosize = '';
  requestAnimationFrame(fit);
  return t;
}

// Si el teléfono gira, los renglones cambian de ancho: reacomodar.
addEventListener('resize', () => {
  for (const t of document.querySelectorAll('textarea[data-autosize]')) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 'px';
  }
});

// ---------- Snackbar (con "Deshacer" en vez de "¿Estás seguro?")

let snackEl = null;
let snackTimer = 0;
let snackDesde = 0;

// Al cambiar de pantalla se va, salvo que se haya mostrado recién
// (ej: "Auto eliminado" justo antes de volver atrás).
export function cerrarSnackViejo() {
  if (snackEl && Date.now() - snackDesde > 600) {
    snackEl.remove();
    snackEl = null;
    clearTimeout(snackTimer);
  }
}

export function snack(text, action, onAction) {
  if (snackEl) snackEl.remove();
  clearTimeout(snackTimer);
  snackDesde = Date.now();
  const el = h(
    'div',
    { class: 'snack', role: 'status' },
    h('p', null, text),
    action
      ? h(
          'button',
          {
            onclick: () => {
              hide();
              onAction();
            },
          },
          action,
        )
      : null,
  );
  function hide() {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
    if (snackEl === el) snackEl = null;
  }
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  snackEl = el;
  snackTimer = setTimeout(hide, action ? 6000 : 3200);
}

// ---------- Menú contextual

export function menu(anchor, options) {
  const scrim = h('div', { class: 'menu-scrim', onclick: close });
  const m = h(
    'div',
    { class: 'menu', role: 'menu' },
    options.map((o) =>
      h(
        'button',
        {
          role: 'menuitemradio',
          'aria-checked': String(!!o.checked),
          'data-estado': o.estado,
          onclick: () => {
            close();
            o.onclick();
          },
        },
        h('i', { class: 'dot' }),
        h('span', null, o.label),
        o.checked ? icon('check') : null,
      ),
    ),
  );
  document.body.append(scrim, m);
  const r = anchor.getBoundingClientRect();
  const mh = m.offsetHeight;
  const top = r.bottom + 4 + mh > innerHeight - 8 ? r.top - mh - 4 : r.bottom + 4;
  m.style.top = Math.max(8, top) + 'px';
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  function close() {
    scrim.remove();
    m.remove();
  }
}
