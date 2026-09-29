// Build Output API entry. API and cron get independent function instances; SSR still reads via HTTP.
import { isApiOwned } from '@aihot/contracts/http-policy';

const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
if (hostname) {
  process.env.SITE_URL ||= `https://${hostname}`;
  process.env.API_BASE_URL ||= process.env.SITE_URL;
}
let api;
let web;

export default async function handler(req, res) {
  try {
    const pathname = new URL(req.url || '/', 'http://function.local').pathname;
    if (isApiOwned(pathname)) {
      api ??= (async () => {
        const { assertProductionSecrets, config } = await import('@aihot/backend/config');
        assertProductionSecrets([['auth', 'SESSION_SECRET'], ['auth', 'IMG_PROXY_SIGN_SECRET']]);
        if (!config.adminPassword || config.adminPassword.length < 12) throw new Error('ADMIN_PASSWORD is required');
        const { buildApp } = await import('./apps/api/src/app.ts');
        const app = await buildApp();
        await app.ready();
        return app;
      })().catch(error => { api = null; throw error; });
      (await api).server.emit('request', req, res);
    } else {
      web ??= import('./apps/web/server.ts');
      (await web).listener(req, res);
    }
  } catch (error) {
    console.error('Request initialization failed', error instanceof Error ? error.name : 'Error');
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Service unavailable');
  }
}
