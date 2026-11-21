// Pruebas de la sincronización: dos "dispositivos" (módulos separados, cada uno con su
// almacenamiento) contra un servidor falso que copia la lógica de gianre_sincronizar.
import { pathToFileURL } from 'node:url';

// Uso: node pruebas/sincronizacion.mjs  (desde la carpeta del proyecto)
const RAIZ = process.argv[2] || process.cwd();
let fallas = 0;
const ok = (cond, texto) => {
  console.log(`${cond ? '✓' : '✗'} ${texto}`);
  if (!cond) fallas++;
};

// ---------- Servidor falso (misma regla que la base: gana el act mayor)
function servidor() {
  const filas = new Map(); // tipo:id -> {tipo,id,datos,act,borrado,version}
  let version = 0;
  return {
    filas,
    sincronizar(desde, cambios) {
      for (const c of cambios) {
        const k = `${c.tipo}:${c.id}`;
        const prev = filas.get(k);
        if (!prev || prev.act < c.act) {
          filas.set(k, { tipo: c.tipo, id: c.id, datos: c.borrado ? null : JSON.parse(JSON.stringify(c.datos)), act: c.act, borrado: !!c.borrado, version: ++version });
        }
      }
      const out = [...filas.values()].filter((f) => f.version > desde).sort((a, b) => a.version - b.version);
      return { hasta: version, cambios: JSON.parse(JSON.stringify(out)) };
    },
  };
}

// ---------- Dispositivo: su propio localStorage y su propia copia de store.js
let n = 0;
async function dispositivo(inicial = {}) {
  const ls = new Map(Object.entries(inicial));
  const storage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
  globalThis.localStorage = storage;
  const S = await import(pathToFileURL(`${RAIZ}/js/store.js`).href + `?d=${++n}`);
  const usar = (fn) => {
    globalThis.localStorage = storage;
    return fn(S);
  };
  const sync = (srv) =>
    usar(() => {
      const { cambios, enviados } = S.paraSubir();
      const res = srv.sincronizar(S.sync.version || 0, cambios);
      S.subidos(enviados);
      S.aplicarRemotos(res.cambios);
      S.sync.version = res.hasta;
      S.guardarMeta();
      return cambios;
    });
  return { S, usar, sync, ls };
}

const conClave = (extra = {}) => ({ 'gianre:sync': JSON.stringify({ clave: 'K', version: 0, sucios: {}, borrados: {}, formato: 2, ...extra }) });

// ---------- 1. Dos personas tocan fallas distintas del mismo auto
{
  const srv = servidor();
  const A = await dispositivo(conClave());
  A.usar((S) => {
    S.db.taller = { nombre: 'Taller' };
    const a = S.crearAuto({ patente: 'AD482KJ' });
    const d = S.nuevoDiag(a.id);
    d.items.push({ id: 'i1', texto: 'Pastillas', estado: 'pronto', precio: null, resultado: null }, { id: 'i2', texto: 'Discos', estado: 'urgente', precio: null, resultado: null });
    S.save();
  });
  A.sync(srv);
  const B = await dispositivo(conClave());
  B.sync(srv);
  ok(B.usar((S) => S.db.diagnosticos[0]?.items.length) === 2, 'El segundo dispositivo recibe el diagnóstico con sus 2 fallas');

  // A cambia el texto de la falla 1, B marca hecha la falla 2, al mismo tiempo
  A.usar((S) => {
    S.db.diagnosticos[0].items.find((i) => i.id === 'i1').texto = 'Pastillas delanteras 30%';
    S.save();
  });
  B.usar((S) => {
    const it = S.db.diagnosticos[0].items.find((i) => i.id === 'i2');
    it.resultado = 'hecho';
    it.resultadoFecha = Date.now();
    it.precio = 85000;
    S.save();
  });
  A.sync(srv);
  B.sync(srv);
  A.sync(srv);
  const estadoA = A.usar((S) => S.db.diagnosticos[0].items.map((i) => `${i.id}:${i.texto}:${i.resultado}:${i.precio}`).sort().join(' | '));
  const estadoB = B.usar((S) => S.db.diagnosticos[0].items.map((i) => `${i.id}:${i.texto}:${i.resultado}:${i.precio}`).sort().join(' | '));
  ok(estadoA === estadoB, 'Los dos dispositivos terminan iguales');
  ok(estadoA.includes('Pastillas delanteras 30%') && estadoA.includes('i2:Discos:hecho:85000'), 'No se pierde ningún cambio: texto nuevo de A y "hecho" + precio de B');

  // Un pedido que llega con la pantalla abierta mantiene el mismo objeto (no queda huérfano)
  const itA = A.usar((S) => S.db.diagnosticos[0].items.find((i) => i.id === 'i2'));
  B.usar((S) => {
    S.db.diagnosticos[0].items.find((i) => i.id === 'i2').resultado = 'despues';
    S.save();
  });
  B.sync(srv);
  A.sync(srv);
  ok(itA.resultado === 'despues', 'Si la pantalla tiene la falla abierta, ve el cambio que llegó (mismo objeto)');
  A.usar((S) => {
    itA.texto = 'Discos y pastillas';
    S.save();
  });
  const subio = A.sync(srv).some((c) => c.tipo === 'items' && c.id === 'i2' && c.datos.texto === 'Discos y pastillas');
  ok(subio, 'Seguir escribiendo en esa falla se guarda y se sube');
}

// ---------- 2. Borrar con el reloj atrasado igual llega a los demás
{
  const srv = servidor();
  const futuro = Date.now() + 3600e3; // el otro equipo tiene la hora 1 h adelantada
  const B = await dispositivo(conClave());
  B.usar((S) => {
    S.db.taller = { nombre: 'T' };
    S.save();
  });
  srv.sincronizar(0, [{ tipo: 'autos', id: 'a1', act: futuro, datos: { id: 'a1', patente: 'AA111AA', clienteId: null, creado: 1 } }]);
  B.sync(srv);
  B.usar((S) => {
    S.borrarAuto('a1');
    S.save();
  });
  B.sync(srv);
  ok(srv.filas.get('autos:a1').borrado === true, 'El borrado se acepta aunque el reloj del equipo esté atrasado');
}

// ---------- 3. "Deshacer" solo vuelve lo borrado
{
  const srv = servidor();
  const A = await dispositivo(conClave());
  let deshacer;
  A.usar((S) => {
    S.db.taller = { nombre: 'T' };
    const a1 = S.crearAuto({ patente: 'AA111AA' });
    S.crearAuto({ patente: 'BB222BB' });
    const d = S.nuevoDiag(a1.id);
    d.items.push({ id: 'x1', texto: 'Frenos', estado: 'urgente', resultado: null });
    S.save();
  });
  A.sync(srv);
  A.usar((S) => {
    deshacer = S.borrarAuto(S.autoPorPatente('AA111AA').id);
    S.save();
    // mientras tanto cambia otro auto
    S.autoPorPatente('BB222BB').modelo = 'Gol';
    S.save();
    deshacer();
  });
  const r = A.usar((S) => ({ a: !!S.autoPorPatente('AA111AA'), diag: S.db.diagnosticos.length, otro: S.autoPorPatente('BB222BB').modelo }));
  ok(r.a && r.diag === 1, 'Deshacer devuelve el auto y su diagnóstico');
  ok(r.otro === 'Gol', 'Deshacer no pisa lo que cambió en esos segundos');
  A.sync(srv);
  ok(srv.filas.get(`autos:${A.usar((S) => S.autoPorPatente('AA111AA').id)}`).borrado === false, 'En la nube el auto vuelve a estar vivo');
}

// ---------- 4. Datos de la versión anterior (formato 1): se migran y se suben bien
{
  const srv = servidor();
  // Así quedó guardado en tu dispositivo antes de este cambio
  srv.sincronizar(0, [
    { tipo: 'taller', id: 'taller', act: 100, datos: { nombre: 'Gianre' } },
    { tipo: 'autos', id: 'a9', act: 100, datos: { id: 'a9', patente: 'CQG852', clienteId: null, creado: 1 } },
    { tipo: 'diagnosticos', id: 'd9', act: 100, datos: { id: 'd9', autoId: 'a9', fecha: 1, nota: '', items: [{ id: 'v1', texto: 'sE', estado: 'bien', hecho: null }, { id: 'v2', texto: 'Discos', estado: 'urgente', hecho: 555 }] } },
  ]);
  const viejo = {
    'gianre:v1': JSON.stringify({
      taller: { nombre: 'Gianre', act: 100 },
      clientes: [],
      autos: [{ id: 'a9', patente: 'CQG852', clienteId: null, creado: 1, act: 100 }],
      diagnosticos: [{ id: 'd9', autoId: 'a9', fecha: 1, nota: '', act: 100, items: [{ id: 'v1', texto: 'sE', estado: 'bien', hecho: null }, { id: 'v2', texto: 'Discos', estado: 'urgente', hecho: 555 }] }],
    }),
    'gianre:sync': JSON.stringify({ clave: 'K', version: 3, sucios: {}, borrados: {} }), // sin "formato": versión anterior
  };
  const V = await dispositivo(viejo);
  const migrado = V.usar((S) => S.db.diagnosticos[0].items.find((i) => i.id === 'v2'));
  ok(migrado.resultado === 'hecho' && migrado.resultadoFecha === 555 && !('hecho' in migrado), 'Lo marcado como hecho pasa a "Hecho" con su fecha');
  const subidos = V.sync(srv);
  ok(subidos.every((c) => typeof c.act === 'number'), 'Nunca se sube un registro sin fecha de cambio (no se traba)');
  ok(subidos.filter((c) => c.tipo === 'items').length === 2, 'Las fallas se suben como registros propios');
  ok(srv.filas.get('diagnosticos:d9').datos.items === undefined, 'El diagnóstico en la nube queda sin las fallas adentro (formato nuevo)');

  // Un dispositivo nuevo que baja datos viejos de la nube (formato anterior) igual ve las fallas
  const srv2 = servidor();
  srv2.sincronizar(0, [
    { tipo: 'autos', id: 'a9', act: 100, datos: { id: 'a9', patente: 'CQG852', clienteId: null, creado: 1 } },
    { tipo: 'diagnosticos', id: 'd9', act: 100, datos: { id: 'd9', autoId: 'a9', fecha: 1, nota: '', items: [{ id: 'v2', texto: 'Discos', estado: 'urgente', hecho: 555 }] } },
  ]);
  const N = await dispositivo(conClave());
  N.usar((S) => {
    S.db.taller = { nombre: 'X' };
    S.save();
  });
  N.sync(srv2);
  const vistas = N.usar((S) => S.db.diagnosticos[0]?.items.map((i) => `${i.texto}:${i.resultado}`).join(','));
  ok(vistas === 'Discos:hecho', 'Un dispositivo nuevo ve las fallas guardadas con el formato anterior');
  N.sync(srv2);
  ok(srv2.filas.has('items:v2'), '…y las vuelve a subir en el formato nuevo');
}

// ---------- 5. Todo lo que se marca para subir queda guardado con su fecha
{
  const A = await dispositivo({ 'gianre:v1': JSON.stringify({ taller: { nombre: 'T' }, clientes: [], autos: [{ id: 'z', patente: 'ZZ999ZZ', creado: 1 }], diagnosticos: [] }) });
  A.usar((S) => S.marcarTodo());
  const guardado = JSON.parse(A.ls.get('gianre:v1'));
  ok(typeof guardado.autos[0].act === 'number', 'marcarTodo deja la fecha de cambio guardada (si se cierra la app no se pierde)');
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallas ? 1 : 0);
