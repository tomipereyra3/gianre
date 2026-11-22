// Avisos de Gianre al celular.
// GET                      → clave pública para que la app se suscriba.
// POST {clave, endpoint}   → aviso de prueba al celular que se acaba de suscribir.
// POST con x-gianre-cron   → resumen de pendientes de cada mañana (lo dispara la tarea programada).

import { enviar, generarClaves } from './webpush.js';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGEN = 'https://gianre.vercel.app';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rpc(nombre: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${nombre}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Las claves VAPID se crean la primera vez y quedan guardadas en la base.
async function config() {
  let c = await rpc('gianre_avisos_config');
  if (!c?.vapid_privada) {
    const k = await generarClaves();
    await rpc('gianre_avisos_config_guardar', { p_publica: k.publica, p_privada: JSON.stringify(k.privada) });
    c = await rpc('gianre_avisos_config');
  }
  return {
    cron: c.avisos_cron as string,
    vapid: { publica: c.vapid_publica as string, privada: JSON.parse(c.vapid_privada), sub: ORIGEN },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { cron, vapid } = await config();
    if (req.method === 'GET') return json({ publica: vapid.publica });

    const delCron = req.headers.get('x-gianre-cron');
    if (delCron !== null) {
      if (delCron !== cron) return json({ error: 'no autorizado' }, 401);
      const lista = (await rpc('gianre_avisos_del_dia')) || [];
      let enviados = 0;
      for (const a of lista) {
        const estado = await enviar(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          { titulo: a.titulo, cuerpo: a.cuerpo, url: './', tag: 'pendientes' },
          vapid,
        );
        await rpc('gianre_aviso_resultado', { p_endpoint: a.endpoint, p_estado: estado });
        if (estado >= 200 && estado < 300) enviados++;
      }
      return json({ enviados, total: lista.length });
    }

    const { clave, endpoint } = await req.json();
    if (typeof clave !== 'string' || typeof endpoint !== 'string') return json({ error: 'faltan datos' }, 400);
    const s = await rpc('gianre_aviso_prueba', { p_clave: clave, p_endpoint: endpoint });
    if (!s) return json({ error: 'no encontrado' }, 404);
    const estado = await enviar(
      { endpoint, keys: s },
      {
        titulo: 'Avisos activados',
        cuerpo: 'Cada mañana te avisamos qué vehículos tienen arreglos pendientes.',
        url: './',
        tag: 'prueba',
      },
      vapid,
    );
    return json({ estado }, estado >= 200 && estado < 300 ? 200 : 502);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
