// Pruebas del año aproximado según la patente.
import { pathToFileURL } from 'node:url';

// Uso: node pruebas/patentes.mjs  (desde la carpeta del proyecto)
const RAIZ = process.argv[2] || process.cwd();
const datos = new Map();
globalThis.localStorage = {
  getItem: (k) => datos.get(k) ?? null,
  setItem: (k, v) => datos.set(k, String(v)),
  removeItem: (k) => datos.delete(k),
};
const S = await import(pathToFileURL(`${RAIZ}/js/store.js`).href);

let fallas = 0;
const es = (patente, esperado) => {
  const anio = S.anioPorPatente(patente);
  const bien = anio === esperado;
  console.log(`${bien ? '✓' : '✗'} ${patente} → ${anio}${bien ? '' : ` (esperaba ${esperado})`}`);
  if (!bien) fallas++;
};

// Formato anterior: enero de cada año
es('AAA 123', 1995);
es('APA 001', 1996);
es('BDZ 999', 1997);
es('GVA 000', 2008);
es('KLM 456', 2011);
es('KUA 100', 2012);
es('PMA 000', 2016);
es('PZZ 999', 2016);
es('RAB 123', null);

// Mercosur
es('AA 000 AA', 2016);
es('AA 899 ZZ', 2016);
es('AA 950 AA', 2017);
es('AC 901 MZ', 2018);
es('AD 482 KJ', 2019);
es('AE 050 AA', 2019);
es('AE 300 AA', 2020);
es('AF 113 RT', 2021);
es('AF 700 AA', 2022);
es('AG 500 AA', 2024);
es('AH 050 AA', 2024);
es('AH 500 AA', 2025);

// Lo que no es patente
es('', null);
es('Martín', null);
es('AD482', null);

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallas ? 1 : 0);
