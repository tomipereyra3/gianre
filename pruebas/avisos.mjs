// Prueba del cifrado y la firma de los avisos (node pruebas/avisos.mjs).
// Hace de "celular": crea sus claves, recibe el aviso cifrado y lo descifra como lo haría el teléfono.

import {
  b64u,
  deB64u,
  unir,
  hkdf,
  cifrar,
  firmaVapid,
  generarClaves,
  INFO_CLAVE,
  INFO_CEK,
  INFO_NONCE,
} from '../supabase/functions/gianre-avisos/webpush.js';

let fallas = 0;
const ok = (cond, msg) => {
  if (cond) console.log('ok -', msg);
  else {
    fallas++;
    console.log('FALLA -', msg);
  }
};

// El celular: su par de claves ECDH y el secreto "auth" de 16 bytes.
const celular = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64u(await crypto.subtle.exportKey('raw', celular.publicKey));
const auth = b64u(crypto.getRandomValues(new Uint8Array(16)));

async function descifrar(cuerpo) {
  const sal = cuerpo.slice(0, 16);
  const rs = new DataView(cuerpo.buffer, cuerpo.byteOffset + 16, 4).getUint32(0);
  const largo = cuerpo[20];
  const asPublica = cuerpo.slice(21, 21 + largo);
  const cifrado = cuerpo.slice(21 + largo);
  const as = await crypto.subtle.importKey('raw', asPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, celular.privateKey, 256));
  const ikm = await hkdf(deB64u(auth), ecdh, unir(INFO_CLAVE, deB64u(p256dh), asPublica), 32);
  const cek = await hkdf(sal, ikm, INFO_CEK, 16);
  const nonce = await hkdf(sal, ikm, INFO_NONCE, 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cifrado));
  return { rs, largo, ultimo: plano[plano.length - 1], texto: new TextDecoder().decode(plano.slice(0, -1)) };
}

const mensaje = JSON.stringify({ titulo: 'Pendientes de hoy', cuerpo: '1 urgente: Correa de distribución · AD 482 KJ.' });
const cuerpo = await cifrar(mensaje, p256dh, auth);
const d = await descifrar(cuerpo);
ok(d.texto === mensaje, 'el celular descifra el mismo mensaje (acentos incluidos)');
ok(d.rs === 4096 && d.largo === 65, 'encabezado aes128gcm: registro 4096 y clave de 65 bytes');
ok(d.ultimo === 2, 'termina con el delimitador de último registro');
const otro = await cifrar(mensaje, p256dh, auth);
ok(b64u(otro) !== b64u(cuerpo), 'cada envío usa sal y clave efímera nuevas');

// Ejemplo oficial del RFC 8291 (apéndice A): mismas claves y sal → mismo resultado, byte a byte.
{
  const rfc = {
    texto: 'When I grow up, I want to be a watermelon',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    asPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    sal: 'DGv6ra1nlYgDCS1FRnbzlw',
    resultado:
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };
  const pub = deB64u(rfc.asPublica);
  const jwk = { kty: 'EC', crv: 'P-256', d: rfc.asPrivada, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const efimera = {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const out = await cifrar(rfc.texto, rfc.uaPublica, rfc.auth, { efimera, sal: deB64u(rfc.sal) });
  ok(b64u(out) === rfc.resultado, 'coincide con el ejemplo oficial del RFC 8291');
}

// Firma VAPID: el servicio de Apple/Google la verifica con la clave pública.
const claves = await generarClaves();
ok(deB64u(claves.publica).length === 65 && deB64u(claves.publica)[0] === 4, 'clave pública VAPID sin comprimir (65 bytes)');
const vapid = { publica: claves.publica, privada: claves.privada, sub: 'https://gianre.vercel.app' };
const jwt = await firmaVapid('https://web.push.apple.com/QGuQyavXutnMH-abc', vapid);
const [cab, datos, firma] = jwt.split('.');
const pub = await crypto.subtle.importKey('raw', deB64u(claves.publica), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
  'verify',
]);
const valida = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  pub,
  deB64u(firma),
  new TextEncoder().encode(`${cab}.${datos}`),
);
ok(valida, 'la firma VAPID se verifica con la clave pública');
const reclamo = JSON.parse(new TextDecoder().decode(deB64u(datos)));
ok(reclamo.aud === 'https://web.push.apple.com', 'aud es el origen del servicio de avisos');
ok(reclamo.exp > Date.now() / 1000 && reclamo.exp <= Date.now() / 1000 + 24 * 3600, 'vence en menos de 24 horas');
ok(JSON.parse(new TextDecoder().decode(deB64u(cab))).alg === 'ES256', 'algoritmo ES256');

if (fallas) {
  console.log(`\n${fallas} prueba(s) fallaron`);
  process.exit(1);
}
console.log('\nTodo bien');
