import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('public tracking waits for consent and excludes sensitive routes after navigation and refusal', async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter,useNavigate} from 'react-router-dom'; import Tracker,{getAnalyticsSessionId} from './frontend/src/components/public/AnalyticsTracker'; function Fixture(){window.go=useNavigate();window.sessionId=getAnalyticsSessionId;return <Tracker/>} createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', define: { 'import.meta.env.VITE_API_URL': '"/api"', 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"' }
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const posts = [];
    const google = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
      if (/^\/measurement\/(core|runtime|bootstrap|zaraz)\.mjs$/.test(url.pathname) || url.pathname === '/measurement/sites.json') return route.fulfill({ contentType: url.pathname.endsWith('.json') ? 'application/json' : 'application/javascript', body: await readFile(resolve('frontend/public' + url.pathname), 'utf8') });
      if (url.pathname === '/api/public/analytics/page-view') { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
      if (url.pathname.startsWith('/avmetrics/') || url.hostname.includes('googletagmanager')) { google.push(url.href); return route.fulfill({ contentType: 'application/javascript', body: '' }); }
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script>window.choices={analytics:false};window.zaraz={consent:{APIReady:true,getAll:()=>window.choices}}</script><script type="module" src="/fixture.js"></script>' });
    });
    await page.goto('https://saudepet.app.br/?utm_source=google&utm_campaign=private@example.com');
    await page.waitForFunction(() => window.go);
    await page.waitForTimeout(550);
    assert.equal(posts.length, 0);
    assert.equal(google.length, 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('sp_visitor_id')), null);
    await page.waitForFunction(() => window.__avilaMeasurement);
    await page.evaluate(() => { window.choices.analytics = true; document.dispatchEvent(new Event('zarazConsentChoicesUpdated')); });
    await page.waitForFunction(() => !!localStorage.getItem('sp_visitor_id'));
    await page.waitForTimeout(150);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].utmSource, 'google');
    assert.equal(posts[0].utmCampaign, undefined);
    assert.equal(google.length, 1);
    await page.evaluate(() => window.go('/tag/private-pet-id'));
    await page.waitForTimeout(550);
    assert.equal(posts.length, 1);
    assert.equal(await page.evaluate(() => window.__avilaMeasurement.track('contact_click', { contact_channel: 'phone' })), false);
    await page.evaluate(() => { window.choices.analytics = false; document.dispatchEvent(new Event('zarazConsentChoicesUpdated')); window.go('/faq'); });
    await page.waitForTimeout(550);
    assert.equal(posts.length, 1);
    assert.equal(await page.evaluate(() => window.sessionId()), undefined);
    assert.ok(!JSON.stringify(await page.evaluate(() => window.dataLayer)).includes('private-pet-id'));
  } finally { await browser.close(); }
});
