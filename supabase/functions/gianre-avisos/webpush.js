// Web Push sin librerías: firma VAPID (RFC 8292) y cifrado aes128gcm (RFC 8291) con WebCrypto.
// Funciona igual en Deno (Supabase) y en Node 20+ (para las pruebas).

const enc = new TextEncoder();

export function b64u(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function unir(...partes) {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

export async function hkdf(sal, ikm, info, largo) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, k, largo * 8));
}

export const INFO_CLAVE = enc.encode('WebPush: info\0');
export const INFO_CEK = enc.encode('Content-Encoding: aes128gcm\0');
export const INFO_NONCE = enc.encode('Content-Encoding: nonce\0');

// Par de claves del servidor: la pública va a la app, la privada queda en la base.
export async function generarClaves() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    publica: b64u(await crypto.subtle.exportKey('raw', par.publicKey)),
    privada: await crypto.subtle.exportKey('jwk', par.privateKey),
  };
}

export async function firmaVapid(endpoint, vapid) {
  const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const datos = b64u(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.sub }),
    ),
  );
  const clave = await crypto.subtle.importKey('jwk', vapid.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, enc.encode(`${cab}.${datos}`));
  return `${cab}.${datos}.${b64u(firma)}`;
}

// El mensaje viaja cifrado: solo el celular que se suscribió lo puede leer.
// (efimera y sal solo se pasan en las pruebas, para comparar con el ejemplo del RFC 8291).
export async function cifrar(texto, p256dh, auth, { efimera = null, sal = null } = {}) {
  const uaPublica = deB64u(p256dh);
  const secreto = deB64u(auth);
  efimera ||= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, efimera.privateKey, 256));
  const ikm = await hkdf(secreto, ecdh, unir(INFO_CLAVE, uaPublica, asPublica), 32);
  sal ||= crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, INFO_CEK, 16);
  const nonce = await hkdf(sal, ikm, INFO_NONCE, 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un solo registro: el texto + 0x02 (último registro, sin relleno).
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, unir(enc.encode(texto), new Uint8Array([2]))),
  );
  const rs = new Uint8Array([0, 0, 16, 0]); // tamaño de registro: 4096
  return unir(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// Devuelve el estado HTTP del servicio de avisos (201 = enviado; 404/410 = el celular ya no existe).
export async function enviar(sub, mensaje, vapid) {
  const cuerpo = await cifrar(JSON.stringify(mensaje), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await firmaVapid(sub.endpoint, vapid)}, k=${vapid.publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: cuerpo,
  });
  if (!r.ok) console.error('aviso', r.status, await r.text().catch(() => ''));
  return r.status;
}
