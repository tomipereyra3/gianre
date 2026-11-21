// Arma lo que recibe el cliente: la imagen para WhatsApp y el PDF (A4).
import {
  fmtPatente,
  esPatenteVieja,
  fmtKm,
  fmtFechaLarga,
  nombreAuto,
  fmtPrecio,
  suma,
  conPrecio,
  iniciales,
} from './store.js';

const C = {
  tinta: '#141414',
  gris: '#5F5C55',
  suave: '#8A867D',
  linea: '#ECEAE4',
  papel: '#F6F5F1',
  cabecera: '#F3F2EE',
  oscuro: '#121212',
  claro: '#F4F4EF',
  claroGris: '#A3A39C',
  etiquetaOscura: '#8C8C86',
  acento: '#E9F516',
  wa: '#25D366',
  azul: '#0C1F99',
};

// Colores del semáforo para papel (más firmes que en la pantalla oscura).
const PRIO = {
  urgente: { label: 'Urgente', dot: '#D7362B', bg: '#FBE7E5', text: '#B4261C' },
  pronto: { label: 'Pronto', dot: '#E8890C', bg: '#FDEEDB', text: '#9A5400' },
  bien: { label: 'Bien', dot: '#23864A', bg: '#E3F2E8', text: '#1B6B3A' },
};
const NO_SE_HIZO = { dot: '#A19D94', bg: '#EFEEE9', text: '#57534B' };

const ORDEN = { urgente: 0, pronto: 1, bien: 2 };
const porPrioridad = (items) => [...items].sort((x, y) => ORDEN[x.estado] - ORDEN[y.estado]);
const ultimoHecho = (diag) => Math.max(0, ...diag.items.map((i) => i.resultadoFecha || 0)) || Date.now();

const SANS = 'Urbanist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const f = (w, s) => `${w} ${s}px ${SANS}`;
const fc = (w, s) => `${w} ${s}px "Saira Condensed", "Arial Narrow", sans-serif`;
const fx = (w, s) => `${w} ${s}px "Saira Extra Condensed", "Arial Narrow", sans-serif`;

// Se cargan al abrir la app, así la imagen sale con la letra correcta.
export const FUENTES = [f(400, 20), f(500, 20), f(600, 20), f(700, 20), f(800, 20), fc(600, 20), fc(700, 20), fx(600, 20), fx(700, 20)];

// ---------- Piezas de dibujo

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

function espaciado(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function texto(ctx, t, x, y, fuente, color, alinear = 'left', ls = 0, base = 'top') {
  ctx.font = fuente;
  espaciado(ctx, ls);
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  ctx.textBaseline = base;
  // Con espaciado, la última letra deja un hueco: se corrige al centrar o alinear a la derecha.
  const corr = alinear === 'center' ? ls / 2 : alinear === 'right' ? ls : 0;
  ctx.fillText(t, x + corr, y);
  espaciado(ctx, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function ancho(ctx, t, fuente, ls = 0) {
  ctx.font = fuente;
  espaciado(ctx, ls);
  const w = ctx.measureText(t).width;
  espaciado(ctx, 0);
  return w;
}

function punto(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tilde(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.5);
  ctx.lineTo(x + s * 0.35, y + s * 0.85);
  ctx.lineTo(x + s, y + s * 0.1);
  ctx.stroke();
  ctx.restore();
}

const WA =
  'M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z';
let waPath = null;
function glifoWA(ctx, x, y, s) {
  waPath ||= new Path2D(WA);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.fillStyle = C.wa;
  ctx.fill(waPath);
  ctx.restore();
}

// Píldora del semáforo: fondo suave, punto y nombre. Devuelve el ancho.
function pildora(ctx, x, y, p, label, fs, ls = 0) {
  const alto = fs * 2.25;
  const d = fs * 0.62;
  const padX = fs * 1.1;
  const gap = fs * 0.6;
  const tw = ancho(ctx, label, f(800, fs), ls) - ls;
  const w = padX + d + gap + tw + padX;
  rr(ctx, x, y, w, alto, alto / 2);
  ctx.fillStyle = p.bg;
  ctx.fill();
  punto(ctx, x + padX + d / 2, y + alto / 2, d / 2, p.dot);
  texto(ctx, label, x + padX + d + gap, y + alto / 2 + fs * 0.04, f(800, fs), p.text, 'left', ls, 'middle');
  return w;
}

// ---------- Patente argentina (mismo dibujo que en la app)

const ESTRELLAS = [
  'M19 1.3 19.62 2.88 21.2 3.5 19.62 4.12 19 5.7 18.38 4.12 16.8 3.5 18.38 2.88Z',
  'M24.5 5.2 25 6.5 26.3 7 25 7.5 24.5 8.8 24 7.5 22.7 7 24 6.5Z',
  'M20.5 10 21.06 11.44 22.5 12 21.06 12.56 20.5 14 19.94 12.56 18.5 12 19.94 11.44Z',
  'M15 6.9 15.45 8.05 16.6 8.5 15.45 8.95 15 10.1 14.55 8.95 13.4 8.5 14.55 8.05Z',
];

// Mercosur 400×130 mm; la anterior 294×129 mm.
const medidaPatente = (patente, alto) => alto * (esPatenteVieja(patente) ? 20 / 8.6 : 20 / 6.5);

function letrasPatente(ctx, txt, cx, cy, fuente, ls, color) {
  ctx.font = fuente;
  espaciado(ctx, ls);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(txt);
  ctx.fillStyle = color;
  // Centrado por la tinta de las letras, no por la caja de la fuente.
  const base = cy + ((m.actualBoundingBoxAscent || 0) - (m.actualBoundingBoxDescent || 0)) / 2;
  ctx.fillText(txt, cx + ls / 2, base);
  espaciado(ctx, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return base;
}

function dibujarPatente(ctx, patente, x, y, alto) {
  const w = medidaPatente(patente, alto);
  const e = w / 20;
  const txt = fmtPatente(patente);
  ctx.save();
  if (esPatenteVieja(patente)) {
    const b = 0.08 * e;
    rr(ctx, x, y, w, alto, 0.6 * e);
    ctx.fillStyle = '#BDBDB8';
    ctx.fill();
    rr(ctx, x + b, y + b, w - 2 * b, alto - 2 * b, 0.55 * e);
    ctx.fillStyle = '#EFEFEC';
    ctx.fill();
    const ix = x + b;
    const iy = y + b;
    const iw = w - 2 * b;
    const ih = alto - 2 * b;
    // Escudo
    ctx.save();
    ctx.translate(ix + 0.6 * e, iy + 0.22 * e);
    ctx.scale((0.95 * e) / 20, (1.25 * e) / 26);
    ctx.beginPath();
    ctx.ellipse(10, 15, 7, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1F5FA0';
    ctx.stroke();
    ctx.fillStyle = '#74ACDF';
    ctx.fill(new Path2D('M3 15A7 9 0 0 1 17 15Z'));
    ctx.fillStyle = '#C8102E';
    ctx.fill(new Path2D('M7 6.5Q10 2.5 13 6.5Z'));
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#3E8E41';
    ctx.stroke(new Path2D('M2.5 16Q2 22 9 24.5M17.5 16Q18 22 11 24.5'));
    ctx.restore();
    // Ranuras
    ctx.fillStyle = '#D3D3CE';
    for (const [rx, ry] of [
      [ix + 5.2 * e, iy + 0.42 * e],
      [ix + iw - 5.2 * e - 1.15 * e, iy + 0.42 * e],
      [ix + 5.2 * e, iy + ih - 0.22 * e - 0.36 * e],
      [ix + iw - 5.2 * e - 1.15 * e, iy + ih - 0.22 * e - 0.36 * e],
    ]) {
      rr(ctx, rx, ry, 1.15 * e, 0.36 * e, 0.18 * e);
      ctx.fill();
    }
    texto(ctx, 'ARGENTINA', ix + iw / 2, iy + 0.98 * e, fc(700, 1.22 * e), '#3E9FDB', 'center', 0.05 * e, 'middle');
    // Panel negro con las letras en relieve
    const px = ix + 0.28 * e;
    const py = iy + 1.72 * e;
    const pw = iw - 0.56 * e;
    const ph = ih - 1.72 * e - 0.85 * e;
    rr(ctx, px, py, pw, ph, 0.45 * e);
    ctx.fillStyle = '#0B0B0B';
    ctx.fill();
    const fs = 6.1 * e;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    letrasPatente(ctx, txt, cx + 0.018 * fs, cy + 0.022 * fs, fx(600, fs), 0.05 * fs, 'rgba(0,0,0,0.95)');
    letrasPatente(ctx, txt, cx - 0.012 * fs, cy - 0.012 * fs, fx(600, fs), 0.05 * fs, 'rgba(255,255,255,0.85)');
    letrasPatente(ctx, txt, cx, cy, fx(600, fs), 0.05 * fs, '#ECECE8');
  } else {
    const b = 0.18 * e;
    rr(ctx, x, y, w, alto, 0.42 * e);
    ctx.fillStyle = '#0B0B0B';
    ctx.fill();
    const ix = x + b;
    const iy = y + b;
    const iw = w - 2 * b;
    const ih = alto - 2 * b;
    rr(ctx, ix, iy, iw, ih, 0.26 * e);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = C.azul;
    ctx.fillRect(ix, iy, iw, 1.5 * e);
    // Logo del Mercosur
    ctx.save();
    ctx.translate(ix + 0.5 * e, iy + 0.1 * e);
    ctx.scale(0.05 * e, 0.05 * e);
    ctx.fillStyle = '#FFFFFF';
    for (const s of ESTRELLAS) ctx.fill(new Path2D(s));
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#3FAF6A';
    ctx.stroke(new Path2D('M5 18.5Q20 13 35 17'));
    ctx.font = fc(600, 6.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('MERCOSUR', 20, 25);
    ctx.restore();
    // Ranuras y país
    ctx.fillStyle = '#FFFFFF';
    rr(ctx, ix + 5.5 * e, iy + 0.14 * e, 1.25 * e, 0.34 * e, 0.17 * e);
    ctx.fill();
    rr(ctx, ix + iw - 5.5 * e - 1.25 * e, iy + 0.14 * e, 1.25 * e, 0.34 * e, 0.17 * e);
    ctx.fill();
    texto(ctx, 'REPÚBLICA ARGENTINA', ix + iw / 2, iy + 0.94 * e, fc(700, 0.92 * e), '#FFFFFF', 'center', 0.02 * e, 'middle');
    // Bandera
    const bx = ix + iw - 0.5 * e - 1.25 * e;
    const by = iy + 0.18 * e;
    rr(ctx, bx, by, 1.25 * e, 1.08 * e, 0.18 * e);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#74ACDF';
    ctx.fillRect(bx, by, 1.25 * e, 1.08 * e);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(bx, by + 0.36 * e, 1.25 * e, 0.36 * e);
    ctx.restore();
    punto(ctx, bx + 0.625 * e, by + 0.54 * e, 0.11 * e, '#F6B40E');
    const fs = 5.1 * e;
    letrasPatente(ctx, txt, ix + iw / 2, iy + 1.5 * e + (ih - 1.5 * e) / 2, fx(700, fs), 0.06 * fs, '#0B0B0B');
    ctx.restore();
  }
  ctx.restore();
  return w;
}

// ---------- Bloques compartidos (el PDF usa k = 1; la imagen, letra más grande)

// El logo entra en una caja sin deformarse ni recortarse.
function medidaLogo(logo, maxW, maxH) {
  const k = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
  return { w: logo.naturalWidth * k, h: logo.naturalHeight * k };
}

// Sin logo: un cuadrado oscuro con las iniciales del taller.
function cajaLogo(ctx, logo, nombre, x, y, lado) {
  if (logo && logo.complete && logo.naturalWidth) {
    const m = medidaLogo(logo, lado * 3, lado);
    ctx.drawImage(logo, x, y + (lado - m.h) / 2, m.w, m.h);
    return m.w;
  }
  rr(ctx, x, y, lado, lado, lado * 0.28);
  ctx.fillStyle = C.oscuro;
  ctx.fill();
  texto(ctx, iniciales(nombre) || 'T', x + lado / 2, y + lado / 2 + lado * 0.03, f(800, lado * 0.36), '#FFFFFF', 'center', 0, 'middle');
  return lado;
}

// Membrete: logo, nombre y contacto; a la derecha, qué es y la fecha.
function membrete(ctx, { x, y, ancho: an, k, taller, logo, titulo, fecha }) {
  const nombre = taller?.nombre || 'Taller';
  const lado = 46 * k;
  const wLogo = cajaLogo(ctx, logo, nombre, x, y, lado);
  const fsT = 8.5 * k;
  const lsT = 1.4 * k;
  const pillW = ancho(ctx, titulo, f(800, fsT), lsT) - lsT + 26 * k;
  const pillH = 22 * k;
  const der = x + an;
  rr(ctx, der - pillW, y + 2 * k, pillW, pillH, pillH / 2);
  ctx.fillStyle = C.tinta;
  ctx.fill();
  texto(ctx, titulo, der - pillW / 2, y + 2 * k + pillH / 2 + 0.4 * k, f(800, fsT), '#FFFFFF', 'center', lsT, 'middle');
  const yFecha = y + 2 * k + pillH + 8 * k;
  texto(ctx, fecha, der, yFecha, f(500, 10 * k), C.gris, 'right');

  const tx = x + wLogo + 14 * k;
  const maxW = der - pillW - 18 * k - tx;
  ctx.font = f(800, 20 * k);
  const lineas = wrap(ctx, nombre, maxW);
  const tel = (taller?.telefono || '').trim();
  const dir = (taller?.direccion || '').trim();
  const fsC = 9.5 * k;
  const g = tel ? fsC * 1.3 : 0;
  ctx.font = f(500, fsC);
  const contacto = wrap(ctx, [tel, dir].filter(Boolean).join('  ·  '), maxW - (g ? g + 5 * k : 0)).filter(Boolean);
  const lhN = 23 * k;
  const lhC = 14 * k;
  const alto = lineas.length * lhN + (contacto.length ? 3 * k + contacto.length * lhC : 0);
  let ty = y + Math.max(0, (lado - alto) / 2);
  for (const l of lineas) {
    texto(ctx, l, tx, ty, f(800, 20 * k), C.tinta);
    ty += lhN;
  }
  if (contacto.length) ty += 3 * k;
  contacto.forEach((l, i) => {
    let cx = tx;
    if (i === 0 && g) {
      glifoWA(ctx, tx, ty + (lhC - g) / 2, g);
      cx += g + 5 * k;
    }
    texto(ctx, l, cx, ty + lhC / 2, f(500, fsC), C.gris, 'left', 0, 'middle');
    ty += lhC;
  });
  return Math.max(y + lado, ty, yFecha + 12 * k) + 22 * k;
}

// Franja oscura: la patente, el auto y el cliente.
function franja(ctx, { x, y, ancho: an, k, apilado, auto, cliente, diag }) {
  const pad = 16 * k;
  const conPatente = !!auto?.patente;
  const modelo = nombreAuto(auto || {});
  const km = diag.km ? `${fmtKm(diag.km)} km` : '';
  const hayAuto = !!(conPatente || modelo || km);
  const hayCliente = !!(cliente && (cliente.nombre || cliente.telefono));
  if (!hayAuto && !hayCliente) return y;

  const altoPat = 46 * k;
  const wPat = conPatente ? medidaPatente(auto.patente, altoPat) : 0;
  const fsL = 7.5 * k;
  const lsL = 1.4 * k;
  const alLado = hayCliente && hayAuto && !apilado;
  const anchoCli = alLado ? 150 * k : 0;

  const vx = x + pad + (conPatente ? wPat + 16 * k : 0);
  const vFin = x + an - pad - (anchoCli ? anchoCli + 20 * k : 0);
  ctx.font = f(700, 14 * k);
  const lm = modelo ? wrap(ctx, modelo, vFin - vx).slice(0, 3) : [];
  const vH = hayAuto ? fsL + 6 * k + lm.length * 17 * k + (km ? 15 * k : 0) : 0;
  const filaAuto = hayAuto ? Math.max(conPatente ? altoPat : 0, vH) : 0;

  const cx = anchoCli ? x + an - pad - anchoCli : x + pad;
  const cw = anchoCli || an - 2 * pad;
  ctx.font = f(700, 12.5 * k);
  const ln = hayCliente ? wrap(ctx, cliente.nombre || '—', cw).slice(0, 2) : [];
  const cH = hayCliente ? fsL + 6 * k + ln.length * 15.5 * k + (cliente.telefono ? 14 * k : 0) : 0;
  const abajo = hayCliente && hayAuto && !alLado;
  const sep = abajo ? 26 * k : 0;
  const interior = alLado ? Math.max(filaAuto, cH) : filaAuto + sep + cH;
  const H = interior + 2 * pad;

  rr(ctx, x, y, an, H, 16 * k);
  ctx.fillStyle = C.oscuro;
  ctx.fill();
  const top = y + pad;
  if (hayAuto) {
    const fy = top + (alLado ? (interior - filaAuto) / 2 : 0);
    if (conPatente) dibujarPatente(ctx, auto.patente, x + pad, fy + (filaAuto - altoPat) / 2, altoPat);
    let ty = fy + (filaAuto - vH) / 2;
    texto(ctx, 'VEHÍCULO', vx, ty, f(700, fsL), C.etiquetaOscura, 'left', lsL);
    ty += fsL + 6 * k;
    for (const l of lm) {
      texto(ctx, l, vx, ty, f(700, 14 * k), C.claro);
      ty += 17 * k;
    }
    if (km) texto(ctx, km, vx, ty + k, f(500, 10 * k), C.claroGris);
  }
  if (hayCliente) {
    let ty = top;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    if (alLado) {
      ctx.fillRect(cx - 20 * k, top + 2 * k, 0.75 * k, interior - 4 * k);
      ty = top + (interior - cH) / 2;
    } else if (abajo) {
      ctx.fillRect(x + pad, top + filaAuto + sep / 2, an - 2 * pad, 0.75 * k);
      ty = top + filaAuto + sep;
    }
    texto(ctx, 'CLIENTE', cx, ty, f(700, fsL), C.etiquetaOscura, 'left', lsL);
    ty += fsL + 6 * k;
    for (const l of ln) {
      texto(ctx, l, cx, ty, f(700, 12.5 * k), C.claro);
      ty += 15.5 * k;
    }
    if (cliente.telefono) texto(ctx, cliente.telefono, cx, ty + k, f(500, 10 * k), C.claroGris);
  }
  return y + H;
}

// Qué suma cada parte. Diagnóstico: urgente y pronto. Trabajo: lo hecho, lo que queda y lo que no se hizo.
function cuentas(trabajo, vivos, aResolver) {
  if (trabajo) {
    const renglones = [];
    const queda = suma(aResolver.filter((i) => !i.resultado || i.resultado === 'despues'));
    const no = suma(aResolver.filter((i) => i.resultado === 'no'));
    if (queda) renglones.push(['Queda pendiente', queda, PRIO.pronto.dot]);
    if (no) renglones.push(['No se hizo', no, NO_SE_HIZO.dot]);
    return { renglones, etiqueta: 'TOTAL DEL TRABAJO', total: suma(aResolver.filter((i) => i.resultado === 'hecho')) };
  }
  const partes = ['urgente', 'pronto']
    .map((k) => [PRIO[k].label, suma(vivos.filter((i) => i.estado === k)), PRIO[k].dot])
    .filter(([, v]) => v);
  return { renglones: partes.length > 1 ? partes : [], etiqueta: 'TOTAL', total: suma(vivos) };
}

// Subtotales y el TOTAL resaltado en amarillo.
function bloqueTotales(ctx, { ancho: an, k, renglones, etiqueta, total }) {
  const alto = renglones.length * 19 * k + (renglones.length ? 6 * k : 0) + 46 * k;
  return {
    alto,
    dibujar(x, y) {
      let ty = y;
      for (const [lbl, valor, color] of renglones) {
        const cy = ty + 9 * k;
        punto(ctx, x + 14 * k + 3.5 * k, cy, 3.5 * k, color);
        texto(ctx, lbl, x + 14 * k + 13 * k, cy, f(500, 10.5 * k), C.gris, 'left', 0, 'middle');
        texto(ctx, fmtPrecio(valor), x + an - 14 * k, cy, f(600, 10.5 * k), C.gris, 'right', 0, 'middle');
        ty += 19 * k;
      }
      if (renglones.length) ty += 6 * k;
      const h = 46 * k;
      rr(ctx, x, ty, an, h, 12 * k);
      ctx.fillStyle = C.acento;
      ctx.fill();
      texto(ctx, etiqueta, x + 14 * k, ty + h / 2 + 0.5 * k, f(800, 8.5 * k), C.oscuro, 'left', 1.5 * k, 'middle');
      texto(ctx, fmtPrecio(total), x + an - 14 * k, ty + h / 2 + 0.5 * k, f(800, 20 * k), C.oscuro, 'right', 0, 'middle');
    },
  };
}

function bloqueBuenEstado(ctx, { ancho: an, k, items }) {
  ctx.font = f(500, 11 * k);
  const lineas = wrap(ctx, items.map((i) => i.texto.trim()).join(', '), an);
  const lh = 15 * k;
  return {
    alto: 7.5 * k + 8 * k + lineas.length * lh,
    dibujar(x, y) {
      punto(ctx, x + 3.5 * k, y + 3.9 * k, 3.5 * k, PRIO.bien.dot);
      texto(ctx, 'REVISADO Y EN BUEN ESTADO', x + 13 * k, y, f(800, 7.5 * k), PRIO.bien.text, 'left', 1.3 * k);
      lineas.forEach((l, i) => texto(ctx, l, x, y + 15.5 * k + i * lh, f(500, 11 * k), C.gris));
    },
  };
}

function bloqueNota(ctx, { ancho: an, k, nota }) {
  const pad = 13 * k;
  ctx.font = f(500, 11 * k);
  const lineas = wrap(ctx, nota, an - 2 * pad);
  const lh = 15.5 * k;
  return {
    alto: pad + 7.5 * k + 8 * k + lineas.length * lh + pad - 3 * k,
    dibujar(x, y) {
      rr(ctx, x, y, an, this.alto, 12 * k);
      ctx.fillStyle = C.papel;
      ctx.fill();
      texto(ctx, 'NOTA', x + pad, y + pad, f(800, 7.5 * k), C.suave, 'left', 1.3 * k);
      lineas.forEach((l, i) => texto(ctx, l, x + pad, y + pad + 15.5 * k + i * lh, f(500, 11 * k), C.tinta));
    },
  };
}

function preparar({ diag, modo = 'diagnostico' }) {
  const trabajo = modo === 'trabajo';
  const vivos = diag.items.filter((i) => i.texto.trim());
  const aResolver = porPrioridad(vivos.filter((i) => i.estado !== 'bien'));
  const precios = conPrecio(trabajo ? aResolver : vivos);
  return {
    trabajo,
    vivos,
    aResolver,
    enBuenEstado: trabajo ? [] : vivos.filter((i) => i.estado === 'bien'),
    nota: trabajo ? '' : (diag.nota || '').trim(),
    precios,
    titulo: trabajo ? 'TRABAJO REALIZADO' : precios ? 'PRESUPUESTO' : 'DIAGNÓSTICO',
    fecha: fmtFechaLarga(trabajo ? ultimoHecho(diag) : diag.fecha),
  };
}

// ---------- Imagen para WhatsApp (1080 px de ancho, letra grande para el celular)

const IW = 540;
const IM = 30;
const IK = 1.45;
const IESC = 2;

function pintarImagen(ctx, datos) {
  const { taller, logo, auto, cliente, diag } = datos;
  const p = preparar(datos);
  const an = IW - 2 * IM;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, IW, 40000);
  let y = membrete(ctx, { x: IM, y: IM, ancho: an, k: IK, taller, logo, titulo: p.titulo, fecha: p.fecha });
  const yf = franja(ctx, { x: IM, y, ancho: an, k: IK, apilado: true, auto, cliente, diag });
  y = yf === y ? y : yf + 30;

  const grupos = p.trabajo
    ? [
        { label: 'Hecho', p: PRIO.bien, tilde: true, items: p.aResolver.filter((i) => i.resultado === 'hecho') },
        { label: 'Queda pendiente', p: PRIO.pronto, porItem: true, items: p.aResolver.filter((i) => !i.resultado || i.resultado === 'despues') },
        { label: 'No se hizo', p: NO_SE_HIZO, porItem: true, apagado: true, items: p.aResolver.filter((i) => i.resultado === 'no') },
      ]
    : ['urgente', 'pronto'].map((k) => ({ label: PRIO[k].label, p: PRIO[k], items: p.aResolver.filter((i) => i.estado === k) }));

  const fs = 18;
  const lh = 24;
  for (const g of grupos) {
    if (!g.items.length) continue;
    pildora(ctx, IM, y, g.p, g.label.toUpperCase(), 11.5, 1.4);
    y += 11.5 * 2.25 + 16;
    g.items.forEach((it, idx) => {
      const precio = p.precios && it.precio ? fmtPrecio(it.precio) : '';
      const wPrecio = precio ? ancho(ctx, precio, f(700, fs)) + 16 : 0;
      ctx.font = f(500, fs);
      const lineas = wrap(ctx, it.texto.trim(), an - 24 - wPrecio);
      if (g.tilde) tilde(ctx, IM + 1, y + 5, 12, PRIO.bien.dot);
      else punto(ctx, IM + 6, y + 12, 4.5, g.porItem ? PRIO[it.estado].dot : g.p.dot);
      lineas.forEach((l, i) => texto(ctx, l, IM + 24, y + 1 + i * lh, f(500, fs), g.apagado ? C.suave : C.tinta));
      if (precio) texto(ctx, precio, IM + an, y + 1, f(700, fs), g.apagado ? C.suave : C.tinta, 'right');
      y += lineas.length * lh;
      if (idx < g.items.length - 1) {
        y += 10;
        ctx.fillStyle = C.linea;
        ctx.fillRect(IM + 24, y, an - 24, 1);
        y += 12;
      }
    });
    y += 32;
  }

  const bloques = [];
  if (p.precios) bloques.push(bloqueTotales(ctx, { ancho: an, k: IK, ...cuentas(p.trabajo, p.vivos, p.aResolver) }));
  if (p.enBuenEstado.length) bloques.push(bloqueBuenEstado(ctx, { ancho: an, k: IK, items: p.enBuenEstado }));
  if (p.nota) bloques.push(bloqueNota(ctx, { ancho: an, k: IK, nota: p.nota }));
  for (const b of bloques) {
    b.dibujar(IM, y);
    y += b.alto + 28;
  }
  return y - 28 + IM;
}

export function dibujarReporte(datos) {
  // Primero se mide (en un lienzo de 1 px), después se dibuja a la medida justa.
  const medir = document.createElement('canvas');
  medir.width = medir.height = 1;
  const alto = pintarImagen(medir.getContext('2d'), datos);
  const cv = document.createElement('canvas');
  cv.width = IW * IESC;
  cv.height = Math.ceil(alto * IESC);
  const ctx = cv.getContext('2d');
  ctx.scale(IESC, IESC);
  pintarImagen(ctx, datos);
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

// ---------- PDF: documento A4 (membrete, franja del auto, tabla, totales)

const A4 = { w: 595.28, h: 841.89 };
const ESCALA = 3; // ~216 ppp: nítido en pantalla e impreso
const M = 40;
const PIE = 40;

export function dibujarPDF(datos) {
  const { taller, logo, auto, cliente, diag } = datos;
  const p = preparar(datos);
  const nombreTaller = taller?.nombre || 'Taller';
  const an = A4.w - 2 * M;
  const paginas = [];
  let ctx;
  let y;

  // Columnas de la tabla
  const colPrio = M + 14;
  const colDet = M + 14 + 92;
  const anchoImporte = p.precios ? 86 : 0;
  const anchoEstado = p.trabajo ? 80 : 0;
  const finDet = A4.w - M - 14 - anchoImporte - anchoEstado - (anchoImporte || anchoEstado ? 12 : 0);
  const colEstado = A4.w - M - 14 - anchoImporte - anchoEstado;

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

  // Encabezado corto de las páginas siguientes
  function membreteCorto() {
    texto(ctx, nombreTaller, M, y, f(800, 12), C.tinta);
    texto(ctx, `${p.titulo} · continuación`, A4.w - M, y + 2, f(700, 8), C.suave, 'right', 1);
    y += 20;
    ctx.fillStyle = C.linea;
    ctx.fillRect(M, y, an, 0.75);
    y += 16;
  }

  const limite = () => A4.h - PIE - 16;
  function asegurar(alto) {
    if (y + alto <= limite()) return false;
    nuevaPagina();
    membreteCorto();
    return true;
  }

  function encabezadoTabla() {
    rr(ctx, M, y, an, 28, 8);
    ctx.fillStyle = C.cabecera;
    ctx.fill();
    const ly = y + 14.5;
    const E = (t, x, al = 'left') => texto(ctx, t, x, ly, f(800, 7.5), C.suave, al, 1.3, 'middle');
    E('PRIORIDAD', colPrio);
    E('DETALLE', colDet);
    if (p.trabajo) E('ESTADO', colEstado);
    if (p.precios) E('IMPORTE', A4.w - M - 14, 'right');
    y += 28;
  }

  function estadoTrabajo(it, x, cy) {
    if (it.resultado === 'hecho') {
      tilde(ctx, x, cy - 4.2, 8.5, PRIO.bien.dot);
      texto(ctx, 'Hecho', x + 13, cy, f(700, 9.5), PRIO.bien.text, 'left', 0, 'middle');
    } else if (it.resultado === 'no') texto(ctx, 'No se hizo', x, cy, f(600, 9.5), C.suave, 'left', 0, 'middle');
    else texto(ctx, 'Pendiente', x, cy, f(600, 9.5), PRIO.pronto.text, 'left', 0, 'middle');
  }

  function fila(it) {
    ctx.font = f(500, 11);
    const lineas = wrap(ctx, it.texto.trim(), finDet - colDet);
    const alto = Math.max(40, lineas.length * 14.5 + 25);
    if (asegurar(alto)) encabezadoTabla();
    const s = PRIO[it.estado];
    pildora(ctx, colPrio, y + 10.5, s, s.label, 8.5);
    const apagado = p.trabajo && it.resultado === 'no';
    lineas.forEach((l, i) => texto(ctx, l, colDet, y + 13 + i * 14.5, f(500, 11), apagado ? C.suave : C.tinta));
    if (p.trabajo) estadoTrabajo(it, colEstado, y + 20);
    if (p.precios && it.precio) {
      texto(ctx, fmtPrecio(it.precio), A4.w - M - 14, y + 13, f(700, 11), apagado ? C.suave : C.tinta, 'right');
    }
    y += alto;
    ctx.fillStyle = C.linea;
    ctx.fillRect(M, y - 0.75, an, 0.75);
  }

  // Abajo: a la izquierda lo revisado y la nota; a la derecha, los totales.
  function cierre() {
    const anchoDer = p.precios ? 220 : 0;
    const anchoIzq = anchoDer ? an - anchoDer - 26 : an;
    const izq = [];
    if (p.enBuenEstado.length) izq.push(bloqueBuenEstado(ctx, { ancho: anchoIzq, k: 1, items: p.enBuenEstado }));
    if (p.nota) izq.push(bloqueNota(ctx, { ancho: anchoIzq, k: 1, nota: p.nota }));
    const der = anchoDer ? bloqueTotales(ctx, { ancho: anchoDer, k: 1, ...cuentas(p.trabajo, p.vivos, p.aResolver) }) : null;
    if (!izq.length && !der) return;
    const altoIzq = izq.reduce((s, b) => s + b.alto, 0) + Math.max(0, izq.length - 1) * 16;
    const altoDer = der ? der.alto : 0;
    const junto = Math.max(altoIzq, altoDer);
    if (junto <= limite() - M - 60) {
      asegurar(junto + 20);
      y += 20;
      if (der) der.dibujar(A4.w - M - anchoDer, y);
      let ly = y;
      for (const b of izq) {
        b.dibujar(M, ly);
        ly += b.alto + 16;
      }
      y += junto;
      return;
    }
    // Nota muy larga: uno debajo del otro.
    if (der) {
      asegurar(altoDer + 20);
      y += 20;
      der.dibujar(A4.w - M - anchoDer, y);
      y += altoDer;
    }
    for (const b of izq) {
      asegurar(b.alto + 16);
      y += 16;
      b.dibujar(M, y);
      y += b.alto;
    }
  }

  function pies() {
    paginas.forEach((cv, i) => {
      ctx = cv.getContext('2d');
      const py = A4.h - PIE + 6;
      ctx.fillStyle = C.linea;
      ctx.fillRect(M, py, an, 0.75);
      const cy = py + 15;
      let x = M;
      if (taller?.telefono) {
        glifoWA(ctx, M, cy - 5, 10);
        x += 14;
      }
      texto(ctx, [nombreTaller, taller?.telefono].filter(Boolean).join(' · '), x, cy, f(500, 8.5), C.suave, 'left', 0, 'middle');
      texto(ctx, `Página ${i + 1} de ${paginas.length}`, A4.w - M, cy, f(500, 8.5), C.suave, 'right', 0, 'middle');
    });
  }

  nuevaPagina();
  y = membrete(ctx, { x: M, y, ancho: an, k: 1, taller, logo, titulo: p.titulo, fecha: p.fecha });
  const yf = franja(ctx, { x: M, y, ancho: an, k: 1, apilado: false, auto, cliente, diag });
  if (yf !== y) y = yf + 22;
  if (p.aResolver.length) {
    encabezadoTabla();
    p.aResolver.forEach(fila);
  }
  cierre();
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
