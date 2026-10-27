const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = process.argv[2], out = process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8765, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/index.html'+(process.argv[4]||'')); await p.waitForFunction('window.done', null, { timeout: 120000 });
  console.log(JSON.stringify(await p.evaluate('window.meshNames')));
  await p.locator('canvas').screenshot({ path: out }); await b.close(); srv.close();
});
