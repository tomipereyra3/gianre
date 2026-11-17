// Arma la imagen del diagnóstico (y el PDF) que recibe el cliente.
import { fmtPatente, esPatenteVieja, fmtKm, fmtFechaLarga, nombreAuto } from './store.js';

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

const font = (w, s, narrow = false) =>
  `${w} ${s}px ${narrow ? '"Archivo Narrow", ' : ''}Archivo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export const FUENTES = [
  font(800, 44),
  font(700, 38),
  font(500, 38),
  font(500, 28),
  font(700, 26, true),
  font(700, 56, true),
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

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s;
  const ih = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function drawPlate(ctx, patente, x, y, w, h) {
  const vieja = esPatenteVieja(patente);
  const band = vieja ? 0 : 20;
  ctx.save();
  rr(ctx, x, y, w, h, 14);
  ctx.fillStyle = vieja ? '#151515' : '#FFFFFF';
  ctx.fill();
  if (band) {
    ctx.save();
    rr(ctx, x, y, w, h, 14);
    ctx.clip();
    ctx.fillStyle = C.blue;
    ctx.fillRect(x, y, w, band);
    ctx.restore();
  }
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#151515';
  rr(ctx, x + 2, y + 2, w - 4, h - 4, 12);
  ctx.stroke();
  ctx.font = font(700, 56, true);
  setSpacing(ctx, 3);
  ctx.fillStyle = vieja ? '#F4F4F4' : '#151515';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtPatente(patente) || 'S/P', x + w / 2, y + band + (h - band) / 2 + 3);
  ctx.restore();
}

// Una sola función mide y dibuja, así el alto siempre coincide.
function layout(ctx, draw, { taller, logo, auto, diag }) {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (draw) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  let y = P;

  // Taller
  const conLogo = !!(logo && logo.complete && logo.naturalWidth);
  const L = 112;
  const x0 = conLogo ? P + L + 28 : P;
  ctx.font = font(800, 44);
  const nombre = wrap(ctx, taller?.nombre || 'Taller', W - x0 - P);
  ctx.font = font(500, 28);
  const sub = wrap(ctx, [taller?.telefono, taller?.direccion].filter(Boolean).join('  ·  '), W - x0 - P).filter(Boolean);
  const bloque = nombre.length * 52 + sub.length * 38 + (sub.length ? 6 : 0);
  let ty = conLogo ? y + Math.max(0, (L - bloque) / 2) : y;
  if (draw && conLogo) {
    ctx.save();
    rr(ctx, P, y, L, L, 26);
    ctx.clip();
    drawCover(ctx, logo, P, y, L, L);
    ctx.restore();
  }
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
    ctx.fillText('DIAGNÓSTICO', P, y + 2);
  }
  setSpacing(ctx, 0);
  ctx.font = font(500, 28);
  if (draw) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText(fmtFechaLarga(diag.fecha), W - P, y);
    ctx.textAlign = 'left';
  }
  y += 34 + 24;

  // Auto
  const pad = 36;
  ctx.font = font(700, 56, true);
  setSpacing(ctx, 3);
  const pw = Math.max(250, ctx.measureText(fmtPatente(auto.patente) || 'S/P').width + 64);
  setSpacing(ctx, 0);
  const ph = 112;
  const tx = P + pad + pw + 32;
  const tw = W - P - pad - tx;
  ctx.font = font(700, 38);
  const modelo = nombreAuto(auto) ? wrap(ctx, nombreAuto(auto), tw) : [];
  const km = diag.km ? `${fmtKm(diag.km)} km` : '';
  const textH = modelo.length * 46 + (km ? (modelo.length ? 44 : 36) : 0);
  const innerH = Math.max(ph, textH);
  const cardH = innerH + pad * 2;
  if (draw) {
    ctx.fillStyle = C.paper;
    rr(ctx, P, y, W - 2 * P, cardH, 32);
    ctx.fill();
    drawPlate(ctx, auto.patente, P + pad, y + pad + (innerH - ph) / 2, pw, ph);
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
  y += cardH + 56;

  // Secciones
  for (const s of SECCIONES) {
    const items = diag.items.filter((i) => i.estado === s.k && i.texto.trim());
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

    ctx.font = font(500, 38);
    items.forEach((it, idx) => {
      const lines = wrap(ctx, it.texto.trim(), W - 2 * P - 52);
      if (draw) {
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(P + 14, y + 23, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.ink;
        lines.forEach((l, i) => ctx.fillText(l, P + 52, y + i * 50));
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

  // Nota
  const nota = (diag.nota || '').trim();
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
export function archivoPDF(cv, nombre) {
  const jpg = bytesDe(cv.toDataURL('image/jpeg', 0.92));
  const w = cv.width;
  const h = cv.height;
  const pw = 595.28;
  const ph = +((pw * h) / w).toFixed(2);
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
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offs[4] = len;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
  );
  push(jpg);
  push('\nendstream\nendobj\n');
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let t = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) t += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
  t += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(t);
  return new File(parts, nombre, { type: 'application/pdf' });
}
