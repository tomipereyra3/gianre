// Un celular con datos propios (clave vieja, versión 57) escanea el QR mientras
// arranca su sincronización normal. Antes quedaba con la versión vieja y no bajaba todo.
import { pathToFileURL } from 'node:url';
// Uso: node pruebas/vincular.mjs  (desde la carpeta del proyecto)
const RAIZ = process.argv[2] || process.cwd();
const ls = new Map();
globalThis.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
ls.set('gianre:v1', JSON.stringify({ taller: { nombre: 'Celu', act: 1 }, clientes: [], autos: [{ id: 'p1', patente: 'AA111AA', act: 2, creado: 1 }], diagnosticos: [] }));
ls.set('gianre:sync', JSON.stringify({ clave: 'VIEJA', version: 57, sucios: {}, borrados: {}, formato: 2 }));
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: () => {}, hidden: false };
globalThis.location = { hash: '#/' };
const llamadas = [];
globalThis.fetch = (url, opts) => {
  const fn = url.split('/').pop();
  const body = JSON.parse(opts.body);
  llamadas.push([fn, body.p_clave, body.p_desde, (body.p_cambios || []).map((c) => c.id).join(',')]);
  let demora, res;
  if (fn === 'gianre_vincular') [demora, res] = [50, 'NUEVA'];
  else if (body.p_clave === 'VIEJA') [demora, res] = [120, { hasta: 57, cambios: [] }];
  else [demora, res] = [30, { hasta: 99, cambios: [{ tipo: 'taller', id: 'taller', act: 500, datos: { nombre: 'Taller de la compu' } }, { tipo: 'autos', id: 'c1', act: 400, datos: { id: 'c1', patente: 'AD482KJ', creado: 1 } }] }];
  return new Promise((r) => setTimeout(() => r({ ok: true, json: async () => res }), demora));
};
const base = pathToFileURL(`${RAIZ}/js/`).href;
const S = await import(base + 'store.js');
const Sync = await import(base + 'sync.js');
// Mismo orden que la app: render() -> vincular(); después Sync.iniciar()
const p = Sync.vincular('ABCD EFGH');
Sync.iniciar(() => {});
await p;
await new Promise((r) => setTimeout(r, 400));
const conNueva = llamadas.filter(([fn, clave]) => fn === 'gianre_sincronizar' && clave === 'NUEVA');
let fallas = 0;
const ok = (c, t) => { console.log(`${c ? '✓' : '✗'} ${t}`); if (!c) fallas++; };
ok(S.sync.clave === 'NUEVA', 'Queda conectado al taller del código (no a uno nuevo ni al viejo)');
ok(conNueva[0]?.[2] === 0, 'La primera sincronización con el taller nuevo pide todo desde el principio');
ok(conNueva[0]?.[3].includes('p1'), 'Sube lo que este celular ya tenía cargado');
ok(S.db.taller.nombre === 'Taller de la compu' && S.autoPorPatente('AD482KJ'), 'Baja el nombre del taller y los autos de la compu');
ok(S.sync.version === 99, 'Queda al día con la nube');
console.log(fallas ? `\n${fallas} fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallas ? 1 : 0);
