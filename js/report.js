// Arma la imagen del diagnóstico (y el PDF) que recibe el cliente.
import { fmtPatente, esPatenteVieja, fmtKm, fmtFechaLarga, nombreAuto, fmtPrecio, suma, conPrecio } from './store.js';

const W = 1080;
const P = 72;

const C = {
  ink: '#141414',
  muted: '#6E6B64',
  faint: '#A19D94',
  line: '#E4E2DB',
  paper: '#F6F5F1',
  blue: '#1D4FB8',
};

const SECCIONES = [
  { k: 'urgente', label: 'Urgente', color: '#D7362B', bg: '#FBE7E5', text: '#B4261C' },
  { k: 'pronto', label: 'Pronto', color: '#E3A008', bg: '#FCF1D9', text: '#8F5B00' },
  { k: 'bien', label: 'En buen estado', color: '#23864A', bg: '#E3F2E8', text: '#1B6B3A' },
];

const HECHO = { k: 'hecho', label: 'Hecho', color: '#23864A', bg: '#E3F2E8', text: '#1B6B3A', tilde: true };
// En el trabajo realizado, lo que queda mantiene el color de su semáforo en cada renglón.
const QUEDA = { k: 'queda', label: 'Queda pendiente', color: '#E3A008', bg: '#FCF1D9', text: '#8F5B00', porItem: true };
const NO_SE_HIZO = { k: 'no', label: 'No se hizo', color: '#A19D94', bg: '#EFEEE9', text: '#57534B', porItem: true };
const COLOR = Object.fromEntries(SECCIONES.map((s) => [s.k, s.color]));

const PRIO = { urgente: 0, pronto: 1, bien: 2 };
const porPrioridad = (items) => [...items].sort((x, y) => PRIO[x.estado] - PRIO[y.estado]);

const ultimoHecho = (diag) => Math.max(0, ...diag.items.map((i) => i.resultadoFecha || 0)) || Date.now();

const font = (w, s, narrow = false) =>
  `${w} ${s}px ${narrow ? '"Archivo Narrow", ' : ''}Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export const FUENTES = [
  font(800, 44),
  font(700, 38),
  font(500, 38),
  font(500, 28),
  font(700, 26, true),
  font(700, 56, true),
  font(600, 36),
  font(800, 46),
  font(400, 10),
  font(800, 17),
  font(700, 15, true),
];

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (!line || ctx.measureText(t).width <= maxW) line = t;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// La patente se dibuja proporcional a su alto (112 en la imagen, ~26 en el PDF).
const anchoPatente = (ctx, patente, h) => {
  const k = h / 112;
  ctx.font = font(700, 56 * k, true);
  setSpacing(ctx, 3 * k);
  const w = Math.max(250 * k, ctx.measureText(fmtPatente(patente)).width + 64 * k);
  setSpacing(ctx, 0);
  return w;
};

function drawPlate(ctx, patente, x, y, w, h) {
  const k = h / 112;
  const vieja = esPatenteVieja(patente);
  const band = vieja ? 0 : 20 * k;
  ctx.save();
  rr(ctx, x, y, w, h, 14 * k);
  ctx.fillStyle = vieja ? '#151515' : '#FFFFFF';
  ctx.fill();
  if (band) {
    ctx.save();
    rr(ctx, x, y, w, h, 14 * k);
    ctx.clip();
    ctx.fillStyle = C.blue;
    ctx.fillRect(x, y, w, band);
    ctx.restore();
  }
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = '#151515';
  rr(ctx, x + 2 * k, y + 2 * k, w - 4 * k, h - 4 * k, 12 * k);
  ctx.stroke();
  ctx.font = font(700, 56 * k, true);
  setSpacing(ctx, 3 * k);
  ctx.fillStyle = vieja ? '#F4F4F4' : '#151515';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtPatente(patente) || 'S/P', x + w / 2, y + band + (h - band) / 2 + 3 * k);
  ctx.restore();
}

// El logo entra en una caja sin deformarse ni recortarse.
function medidaLogo(logo, maxW, maxH) {
  const k = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
  return { w: logo.naturalWidth * k, h: logo.naturalHeight * k };
}

// Una sola función mide y dibuja, así el alto siempre coincide.
function layout(ctx, draw, { taller, logo, auto, cliente, diag, modo = 'diagnostico' }) {
  const trabajo = modo === 'trabajo';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (draw) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  let y = P;

  // Taller
  const conLogo = !!(logo && logo.complete && logo.naturalWidth);
  const ml = conLogo ? medidaLogo(logo, 280, 112) : { w: 0, h: 0 };
  const L = ml.h;
  const x0 = conLogo ? P + ml.w + 28 : P;
  ctx.font = font(800, 44);
  const nombre = wrap(ctx, taller?.nombre || 'Taller', W - x0 - P);
  ctx.font = font(500, 28);
  const sub = wrap(ctx, [taller?.telefono, taller?.direccion].filter(Boolean).join('  ·  '), W - x0 - P).filter(Boolean);
  const bloque = nombre.length * 52 + sub.length * 38 + (sub.length ? 6 : 0);
  let ty = conLogo ? y + Math.max(0, (L - bloque) / 2) : y;
  if (draw && conLogo) ctx.drawImage(logo, P, y, ml.w, ml.h);
  ctx.font = font(800, 44);
  for (const l of nombre) {
    if (draw) {
      ctx.fillStyle = C.ink;
      ctx.fillText(l, x0, ty);
    }
    ty += 52;
  }
  if (sub.length) ty += 6;
  ctx.font = font(500, 28);
  for (const l of sub) {
    if (draw) {
      ctx.fillStyle = C.muted;
      ctx.fillText(l, x0, ty);
    }
    ty += 38;
  }
  y = Math.max(ty, conLogo ? y + L : ty) + 44;

  if (draw) {
    ctx.fillStyle = C.line;
    ctx.fillRect(P, y, W - 2 * P, 2);
  }
  y += 44;

  // Título + fecha
  ctx.font = font(700, 26, true);
  setSpacing(ctx, 3);
  if (draw) {
    ctx.fillStyle = C.faint;
    ctx.fillText(trabajo ? 'TRABAJO REALIZADO' : 'DIAGNÓSTICO', P, y + 2);
  }
  setSpacing(ctx, 0);
  ctx.font = font(500, 28);
  if (draw) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText(fmtFechaLarga(trabajo ? ultimoHecho(diag) : diag.fecha), W - P, y);
    ctx.textAlign = 'left';
  }
  y += 34 + 24;

  // Auto (si no cargaron patente, lo identifica el cliente)
  const pad = 36;
  const conPatente = !!auto.patente;
  ctx.font = font(700, 56, true);
  setSpacing(ctx, 3);
  const pw = conPatente ? Math.max(250, ctx.measureText(fmtPatente(auto.patente)).width + 64) : 0;
  setSpacing(ctx, 0);
  const ph = conPatente ? 112 : 0;
  const tx = conPatente ? P + pad + pw + 32 : P + pad;
  const tw = W - P - pad - tx;
  ctx.font = font(700, 38);
  const tituloAuto = nombreAuto(auto) || (conPatente ? '' : cliente?.nombre || '');
  const modelo = tituloAuto ? wrap(ctx, tituloAuto, tw) : [];
  const km = diag.km ? `${fmtKm(diag.km)} km` : '';
  const textH = modelo.length * 46 + (km ? (modelo.length ? 44 : 36) : 0);
  const innerH = Math.max(ph, textH);
  const cardH = innerH ? innerH + pad * 2 : 0;
  // Si solo está la patente, la caja abraza la patente.
  const cardW = modelo.length || km ? W - 2 * P : pw + pad * 2;
  if (draw && cardH) {
    ctx.fillStyle = C.paper;
    rr(ctx, P, y, cardW, cardH, 32);
    ctx.fill();
    if (conPatente) drawPlate(ctx, auto.patente, P + pad, y + pad + (innerH - ph) / 2, pw, ph);
  }
  let yy = y + pad + (innerH - textH) / 2;
  ctx.font = font(700, 38);
  for (const l of modelo) {
    if (draw) {
      ctx.fillStyle = C.ink;
      ctx.fillText(l, tx, yy);
    }
    yy += 46;
  }
  if (km) {
    ctx.font = font(500, 30);
    if (draw) {
      ctx.fillStyle = C.muted;
      ctx.fillText(km, tx, yy + (modelo.length ? 8 : 0));
    }
  }
  if (cardH) y += cardH + 56;

  // Secciones. Diagnóstico: por semáforo. Trabajo: lo hecho, lo que queda y lo que no se hizo.
  const vivos = diag.items.filter((i) => i.texto.trim());
  const aResolver = vivos.filter((i) => i.estado !== 'bien');
  const grupos = trabajo
    ? [
        { ...HECHO, items: porPrioridad(aResolver.filter((i) => i.resultado === 'hecho')) },
        { ...QUEDA, items: porPrioridad(aResolver.filter((i) => !i.resultado || i.resultado === 'despues')) },
        { ...NO_SE_HIZO, items: porPrioridad(aResolver.filter((i) => i.resultado === 'no')) },
      ]
    : SECCIONES.map((s) => ({ ...s, items: vivos.filter((i) => i.estado === s.k) }));

  // Precios: columna a la derecha, solo si el mecánico los cargó.
  const precios = conPrecio(trabajo ? aResolver : vivos);
  ctx.font = font(600, 36);
  const anchoPrecio = precios
    ? Math.max(...vivos.map((i) => (i.precio ? ctx.measureText(fmtPrecio(i.precio)).width : 0))) + 32
    : 0;

  for (const s of grupos) {
    const items = s.items;
    if (!items.length) continue;
    ctx.font = font(700, 26, true);
    setSpacing(ctx, 2.5);
    const label = s.label.toUpperCase();
    const lw = ctx.measureText(label).width;
    if (draw) {
      ctx.fillStyle = s.bg;
      rr(ctx, P, y, lw + 76, 52, 26);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(P + 28, y + 26, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.text;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, P + 48, y + 28);
      ctx.textBaseline = 'top';
    }
    setSpacing(ctx, 0);
    y += 52 + 26;

    items.forEach((it, idx) => {
      ctx.font = font(500, 38);
      const lines = wrap(ctx, it.texto.trim(), W - 2 * P - 52 - anchoPrecio);
      if (draw) {
        if (s.tilde) {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(P + 2, y + 24);
          ctx.lineTo(P + 11, y + 33);
          ctx.lineTo(P + 28, y + 13);
          ctx.stroke();
        } else {
          ctx.fillStyle = s.porItem ? COLOR[it.estado] : s.color;
          ctx.beginPath();
          ctx.arc(P + 14, y + 23, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = s.k === 'no' ? C.muted : C.ink;
        lines.forEach((l, i) => ctx.fillText(l, P + 52, y + i * 50));
        if (precios && it.precio) {
          ctx.font = font(600, 36);
          ctx.textAlign = 'right';
          ctx.fillStyle = s.k === 'no' ? C.faint : C.ink;
          ctx.fillText(fmtPrecio(it.precio), W - P, y + 2);
          ctx.textAlign = 'left';
        }
      }
      y += lines.length * 50;
      if (idx < items.length - 1) {
        y += 14;
        if (draw) {
          ctx.fillStyle = C.line;
          ctx.fillRect(P + 52, y, W - 2 * P - 52, 2);
        }
        y += 16;
      }
    });
    y += 60;
  }

  // Total: el presupuesto (diagnóstico) o lo que se cobra (trabajo realizado).
  if (precios) {
    const total = trabajo ? suma(aResolver.filter((i) => i.resultado === 'hecho')) : suma(vivos);
    const queda = trabajo ? suma(aResolver.filter((i) => !i.resultado || i.resultado === 'despues')) : 0;
    const alto = 104 + (queda ? 48 : 0);
    if (draw) {
      ctx.fillStyle = C.paper;
      rr(ctx, P, y, W - 2 * P, alto, 28);
      ctx.fill();
      ctx.font = font(700, 26, true);
      setSpacing(ctx, 3);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = 'middle';
      ctx.fillText(trabajo ? 'TOTAL DEL TRABAJO' : 'TOTAL', P + 36, y + 52);
      setSpacing(ctx, 0);
      ctx.font = font(800, 46);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'right';
      ctx.fillText(fmtPrecio(total), W - P - 36, y + 54);
      if (queda) {
        ctx.font = font(500, 30);
        ctx.fillStyle = C.muted;
        ctx.fillText(`Queda pendiente ${fmtPrecio(queda)}`, W - P - 36, y + 112);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
    y += alto + 60;
  }

  // Nota (solo en el diagnóstico)
  const nota = trabajo ? '' : (diag.nota || '').trim();
  if (nota) {
    ctx.font = font(500, 34);
    const lines = wrap(ctx, nota, W - 2 * P - 72);
    const boxH = 36 + 30 + 14 + lines.length * 46 + 30;
    if (draw) {
      ctx.fillStyle = C.paper;
      rr(ctx, P, y, W - 2 * P, boxH, 28);
      ctx.fill();
      ctx.font = font(700, 24, true);
      setSpacing(ctx, 3);
      ctx.fillStyle = C.faint;
      ctx.fillText('NOTA', P + 36, y + 36);
      setSpacing(ctx, 0);
      ctx.font = font(500, 34);
      ctx.fillStyle = C.ink;
      lines.forEach((l, i) => ctx.fillText(l, P + 36, y + 36 + 30 + 14 + i * 46));
    }
    y += boxH + 60;
  }

  return y + P - 60;
}

export function dibujarReporte(data) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = 100;
  const alto = Math.ceil(layout(cv.getContext('2d'), false, data));
  cv.height = alto;
  layout(cv.getContext('2d'), true, data);
  return cv;
}

// ---------- Archivos

function bytesDe(dataURL) {
  const bin = atob(dataURL.slice(dataURL.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const archivoPNG = (cv, nombre) =>
  new File([bytesDe(cv.toDataURL('image/png'))], nombre, { type: 'image/png' });

// PDF de una página con la imagen (JPEG) ocupando todo el ancho.

// ---------- PDF: documento A4 (membrete, datos, tabla, totales)

const A4 = { w: 595.28, h: 841.89 };
const ESCALA = 3; // ~216 ppp: nítido en pantalla e impreso
const M = 42;
const PIE = 46;

const COLOR_ESTADO = Object.fromEntries(SECCIONES.map((s) => [s.k, s]));
const ETIQUETA = { urgente: 'Urgente', pronto: 'Pronto', bien: 'Bien' };

export function dibujarPDF({ taller, logo, auto, cliente, diag, modo = 'diagnostico' }) {
  const trabajo = modo === 'trabajo';
  const vivos = diag.items.filter((i) => i.texto.trim());
  const aResolver = porPrioridad(vivos.filter((i) => i.estado !== 'bien'));
  const enBuenEstado = vivos.filter((i) => i.estado === 'bien');
  const precios = conPrecio(trabajo ? aResolver : vivos);
  const titulo = trabajo ? 'TRABAJO REALIZADO' : precios ? 'PRESUPUESTO' : 'DIAGNÓSTICO';
  const fecha = fmtFechaLarga(trabajo ? ultimoHecho(diag) : diag.fecha);
  const nombreTaller = taller?.nombre || 'Taller';
  const contacto = [taller?.telefono, taller?.direccion].filter(Boolean).join('  ·  ');

  const paginas = [];
  let ctx;
  let y;

  // Columnas de la tabla
  const colPrioridad = M;
  const anchoPrioridad = 76;
  const anchoEstado = trabajo ? 78 : 0;
  const anchoImporte = precios ? 78 : 0;
  const colDetalle = M + anchoPrioridad;
  const finDetalle = A4.w - M - anchoEstado - anchoImporte - (anchoEstado || anchoImporte ? 10 : 0);
  const colEstado = A4.w - M - anchoImporte - anchoEstado;

  const texto = (t, x, yy, { f = font(400, 10), color = C.ink, alinear = 'left', espacio = 0 } = {}) => {
    ctx.font = f;
    setSpacing(ctx, espacio);
    ctx.fillStyle = color;
    ctx.textAlign = alinear;
    ctx.fillText(t, x, yy);
    setSpacing(ctx, 0);
    ctx.textAlign = 'left';
  };
  const etiqueta = (t, x, yy, alinear = 'left') =>
    texto(t, x, yy, { f: font(700, 7.5, true), color: C.faint, espacio: 1.2, alinear });

  function nuevaPagina() {
    const cv = document.createElement('canvas');
    cv.width = Math.round(A4.w * ESCALA);
    cv.height = Math.round(A4.h * ESCALA);
    ctx = cv.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A4.w, A4.h);
    ctx.textBaseline = 'top';
    paginas.push(cv);
    y = M;
  }

  // Membrete completo (primera página)
  function membrete() {
    const conLogo = !!(logo && logo.complete && logo.naturalWidth);
    const ml = conLogo ? medidaLogo(logo, 150, 54) : { w: 0, h: 0 };
    if (conLogo) ctx.drawImage(logo, M, y, ml.w, ml.h);
    const x = conLogo ? M + ml.w + 14 : M;
    ctx.font = font(700, 15, true);
    setSpacing(ctx, 1.6);
    const anchoTitulo = ctx.measureText(titulo).width;
    setSpacing(ctx, 0);
    const maxTexto = A4.w - M - anchoTitulo - 24 - x;
    ctx.font = font(800, 17);
    const lineasNombre = wrap(ctx, nombreTaller, maxTexto);
    ctx.font = font(400, 9);
    const lineasContacto = contacto ? wrap(ctx, contacto, maxTexto) : [];
    const altoTexto = lineasNombre.length * 20 + lineasContacto.length * 12.5;
    let ty = y + Math.max(0, (ml.h - altoTexto) / 2);
    for (const l of lineasNombre) {
      texto(l, x, ty, { f: font(800, 17) });
      ty += 20;
    }
    for (const l of lineasContacto) {
      texto(l, x, ty, { f: font(400, 9), color: C.muted });
      ty += 12.5;
    }
    texto(titulo, A4.w - M, y + 2, { f: font(700, 15, true), espacio: 1.6, alinear: 'right' });
    texto(fecha, A4.w - M, y + 22, { f: font(400, 9), color: C.muted, alinear: 'right' });
    y = Math.max(ty, y + ml.h, y + 36) + 14;
    ctx.fillStyle = C.ink;
    ctx.fillRect(M, y, A4.w - 2 * M, 2);
    y += 16;
  }

  // Encabezado corto de las páginas siguientes
  function membreteCorto() {
    texto(nombreTaller, M, y, { f: font(800, 11) });
    texto(`${titulo} · continuación`, A4.w - M, y + 1, { f: font(700, 8.5, true), color: C.muted, espacio: 1, alinear: 'right' });
    y += 18;
    ctx.fillStyle = C.line;
    ctx.fillRect(M, y, A4.w - 2 * M, 1);
    y += 14;
  }

  // Vehículo y cliente, en dos tarjetas
  function datos() {
    const gap = 12;
    const cw = (A4.w - 2 * M - gap) / 2;
    const ch = 62;
    for (const [i, lbl] of [[0, 'VEHÍCULO'], [1, 'CLIENTE']]) {
      const cx = M + i * (cw + gap);
      ctx.fillStyle = C.paper;
      rr(ctx, cx, y, cw, ch, 8);
      ctx.fill();
      etiqueta(lbl, cx + 12, y + 10);
    }
    // Vehículo
    let vx = M + 12;
    const modelo = nombreAuto(auto);
    if (auto.patente) {
      const ph = 26;
      const pw = anchoPatente(ctx, auto.patente, ph);
      drawPlate(ctx, auto.patente, vx, y + 26, pw, ph);
      vx += pw + 10;
    }
    const maxV = M + cw - 12 - vx;
    ctx.font = font(700, 10.5);
    const lineaModelo = modelo ? wrap(ctx, modelo, maxV)[0] : auto.patente ? '' : cliente?.nombre || '—';
    if (lineaModelo) texto(lineaModelo, vx, y + 27, { f: font(700, 10.5) });
    if (diag.km) texto(`${fmtKm(diag.km)} km`, vx, y + (lineaModelo ? 41 : 33), { f: font(400, 9), color: C.muted });
    // Cliente
    const cx = M + cw + gap + 12;
    texto(cliente?.nombre || '—', cx, y + 27, { f: font(700, 10.5) });
    if (cliente?.telefono) texto(cliente.telefono, cx, y + 41, { f: font(400, 9), color: C.muted });
    y += ch + 20;
  }

  function encabezadoTabla() {
    ctx.fillStyle = '#EFEEE9';
    rr(ctx, M, y, A4.w - 2 * M, 22, 5);
    ctx.fill();
    etiqueta('PRIORIDAD', colPrioridad + 10, y + 7.5);
    etiqueta('DETALLE', colDetalle, y + 7.5);
    if (trabajo) etiqueta('ESTADO', colEstado, y + 7.5);
    if (precios) etiqueta('IMPORTE', A4.w - M - 10, y + 7.5, 'right');
    y += 22;
  }

  const limite = () => A4.h - PIE - 24;
  function asegurar(alto) {
    if (y + alto <= limite()) return false;
    nuevaPagina();
    membreteCorto();
    return true;
  }

  function fila(it) {
    ctx.font = font(400, 10);
    const lineas = wrap(ctx, it.texto.trim(), finDetalle - colDetalle);
    const alto = Math.max(1, lineas.length) * 13.5 + 14;
    if (asegurar(alto)) encabezadoTabla();
    const s = COLOR_ESTADO[it.estado];
    const top = y + 8;
    // Prioridad: punto de color + nombre
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(colPrioridad + 13.5, top + 5.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    texto(ETIQUETA[it.estado], colPrioridad + 22, top + 0.5, { f: font(700, 8.5), color: s.text });
    const apagado = trabajo && it.resultado === 'no';
    lineas.forEach((l, i) => texto(l, colDetalle, top + i * 13.5, { f: font(400, 10), color: apagado ? C.muted : C.ink }));
    if (trabajo) {
      const r = it.resultado;
      if (r === 'hecho') {
        ctx.strokeStyle = HECHO.color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(colEstado, top + 5.5);
        ctx.lineTo(colEstado + 3, top + 8.5);
        ctx.lineTo(colEstado + 8.5, top + 2);
        ctx.stroke();
        texto('Hecho', colEstado + 12, top + 0.5, { f: font(700, 9), color: HECHO.text });
      } else if (r === 'no') texto('No se hizo', colEstado, top + 0.5, { f: font(600, 9), color: C.muted });
      else texto('Pendiente', colEstado, top + 0.5, { f: font(600, 9), color: QUEDA.text });
    }
    if (precios && it.precio) {
      texto(fmtPrecio(it.precio), A4.w - M - 10, top, { f: font(600, 10), color: apagado ? C.faint : C.ink, alinear: 'right' });
    }
    y += alto;
    ctx.fillStyle = C.line;
    ctx.fillRect(M, y, A4.w - 2 * M, 0.75);
  }

  function totales() {
    if (!precios) return;
    const renglones = [];
    if (trabajo) {
      const hecho = suma(aResolver.filter((i) => i.resultado === 'hecho'));
      const queda = suma(aResolver.filter((i) => !i.resultado || i.resultado === 'despues'));
      const no = suma(aResolver.filter((i) => i.resultado === 'no'));
      if (queda) renglones.push(['Queda pendiente', queda]);
      if (no) renglones.push(['No se hizo', no]);
      renglones.push(['TOTAL DEL TRABAJO', hecho, true]);
    } else {
      const porPrioridadTotal = ['urgente', 'pronto'].map((k) => [ETIQUETA[k], suma(vivos.filter((i) => i.estado === k))]).filter(([, v]) => v);
      if (porPrioridadTotal.length > 1) renglones.push(...porPrioridadTotal);
      renglones.push(['TOTAL', suma(vivos), true]);
    }
    const alto = renglones.length * 18 + 22;
    asegurar(alto + 16);
    y += 14;
    const ancho = 230;
    const x = A4.w - M - ancho;
    ctx.fillStyle = C.paper;
    rr(ctx, x, y, ancho, alto, 8);
    ctx.fill();
    let ty = y + 11;
    for (const [lbl, valor, fuerte] of renglones) {
      if (fuerte) {
        ctx.fillStyle = C.line;
        ctx.fillRect(x + 12, ty - 4, ancho - 24, 0.75);
        texto(lbl, x + 12, ty + 2, { f: font(700, 8.5, true), color: C.muted, espacio: 1.2 });
        texto(fmtPrecio(valor), x + ancho - 12, ty - 1, { f: font(800, 14), alinear: 'right' });
      } else {
        texto(lbl, x + 12, ty, { f: font(400, 9.5), color: C.muted });
        texto(fmtPrecio(valor), x + ancho - 12, ty, { f: font(600, 9.5), color: C.muted, alinear: 'right' });
      }
      ty += 18;
    }
    y += alto + 6;
  }

  function enBuenEstadoYNota() {
    if (!trabajo && enBuenEstado.length) {
      ctx.font = font(400, 9.5);
      const lineas = wrap(ctx, enBuenEstado.map((i) => i.texto.trim()).join(', '), A4.w - 2 * M);
      asegurar(lineas.length * 13 + 30);
      y += 16;
      ctx.fillStyle = SECCIONES[2].color;
      ctx.beginPath();
      ctx.arc(M + 3.5, y + 3.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      etiqueta('REVISADO Y EN BUEN ESTADO', M + 11, y);
      y += 14;
      lineas.forEach((l, i) => texto(l, M, y + i * 13, { f: font(400, 9.5), color: C.muted }));
      y += lineas.length * 13;
    }
    const nota = trabajo ? '' : (diag.nota || '').trim();
    if (nota) {
      ctx.font = font(400, 10);
      const lineas = wrap(ctx, nota, A4.w - 2 * M - 24);
      const alto = 28 + lineas.length * 14 + 10;
      asegurar(alto + 16);
      y += 16;
      ctx.fillStyle = C.paper;
      rr(ctx, M, y, A4.w - 2 * M, alto, 8);
      ctx.fill();
      etiqueta('NOTA', M + 12, y + 11);
      lineas.forEach((l, i) => texto(l, M + 12, y + 26 + i * 14, { f: font(400, 10) }));
      y += alto;
    }
  }

  function pies() {
    paginas.forEach((cv, i) => {
      ctx = cv.getContext('2d');
      const py = A4.h - PIE + 14;
      ctx.fillStyle = C.line;
      ctx.fillRect(M, py, A4.w - 2 * M, 0.75);
      texto([nombreTaller, taller?.telefono].filter(Boolean).join(' · '), M, py + 9, { f: font(400, 8), color: C.faint });
      texto(`Página ${i + 1} de ${paginas.length}`, A4.w - M, py + 9, { f: font(400, 8), color: C.faint, alinear: 'right' });
    });
  }

  nuevaPagina();
  membrete();
  datos();
  if (aResolver.length) {
    encabezadoTabla();
    aResolver.forEach(fila);
  }
  totales();
  enBuenEstadoYNota();
  pies();
  return paginas;
}

// PDF con una imagen por página (A4).
export function archivoPDF(paginas, nombre) {
  const lista = Array.isArray(paginas) ? paginas : [paginas];
  const enc = new TextEncoder();
  const parts = [];
  const offs = [];
  let len = 0;
  const push = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    len += b.length;
  };
  const obj = (n, body) => {
    offs[n] = len;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  const n = lista.length;
  // Objetos: 1 catálogo, 2 páginas, y por cada página: página, imagen, contenido.
  const idPagina = (i) => 3 + i * 3;
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${lista.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] /Count ${n} >>`);
  lista.forEach((cv, i) => {
    const p = idPagina(i);
    const pw = 595.28;
    const ph = +((pw * cv.height) / cv.width).toFixed(2);
    const jpg = bytesDe(cv.toDataURL('image/jpeg', 0.9));
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
    offs[p + 1] = len;
    push(
      `${p + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
    );
    push(jpg);
    push('\nendstream\nendobj\n');
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    obj(p + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 3 + n * 3;
  const xref = len;
  let t = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) t += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  t += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(t);
  return new File(parts, nombre, { type: 'application/pdf' });
}
