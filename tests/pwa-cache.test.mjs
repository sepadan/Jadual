import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {APP_VERSION} from '../data.js';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('module graph uses versioned cache keys present in offline shell',()=>{
  const sw=read('sw.js');
  assert.ok(sw.includes(`const VERSION = "${APP_VERSION}"`));
  for(const file of ['app.js','admin-api.js','builder-relief.js','pdf-import.js','relief-engine.js']) {
    for(const match of read(file).matchAll(/from ["'](\.\/[^"']+)["']/g)) {
      assert.ok(match[1].endsWith(`?v=${APP_VERSION}`),match[1]);
      assert.ok(sw.includes(`"${match[1]}"`),match[1]);
      assert.ok(existsSync(new URL(`../${match[1].split('?')[0]}`,import.meta.url)));
    }
  }
});
test('PWA recovery starts before application modules',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf("navigator.serviceWorker.register") < html.indexOf('type="module"'));
  assert.ok(html.includes(`./app.js?v=${APP_VERSION}`));
  assert.ok(!html.includes('<script src="./builder.js'));
  assert.ok(read('sw.js').includes(`./builder.js?v=${APP_VERSION}`));
});

test('every file in the offline shell really exists, so install cannot fail as a whole',()=>{
  const shell=read('sw.js').match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell,'APP_SHELL is missing from sw.js');
  const entries=[...shell[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]);
  assert.ok(entries.length>=20,`expected the whole shell, found ${entries.length} entries`);
  for(const entry of entries) {
    const file=entry.split('?')[0].replace(/^\.\//,'').replace(/\/$/,'index.html');
    if(!file) continue;
    assert.ok(existsSync(new URL(`../${file}`,import.meta.url)),`${entry} is listed in APP_SHELL but missing on disk`);
  }
});


// Lawatan pertama tidak sepatutnya membayar 2.3 MB alat PDF yang hanya admin perlukan, tetapi salinan
// luar talian mesti tetap lengkap tidak lama selepas itu.
test('the heavy PDF toolchain is off the first-visit shell but still precached',()=>{
  const sw=read('sw.js');
  const shell=sw.slice(sw.indexOf('const APP_SHELL'),sw.indexOf('const HEAVY_SHELL'));
  const heavy=sw.slice(sw.indexOf('const HEAVY_SHELL'),sw.indexOf('self.addEventListener("install"'));
  for(const file of ['vendor/pdf.min.js','vendor/pdf.worker.min.js','vendor/html2canvas-1.4.1.min.js','vendor/jspdf-3.0.4.umd.min.js']) {
    assert.ok(!shell.includes(file),`${file} is still in the blocking shell`);
    assert.ok(heavy.includes(file),`${file} is no longer precached at all`);
  }
  assert.match(sw,/CACHE_HEAVY[\s\S]*cache\.addAll\(HEAVY_SHELL\)/,'the heavy list is never fetched on request');
  const install=sw.slice(sw.indexOf('addEventListener("install"'),sw.indexOf('addEventListener("activate"'));
  assert.ok(!install.includes('HEAVY_SHELL'),'install still blocks on the heavy toolchain');
  assert.match(read('app.js'),/postMessage\("CACHE_HEAVY"\)/,'nothing ever asks for the offline PDF tools');
});

// Shell yang sudah ada pada peranti tidak sepatutnya menunggu rangkaian pada lawatan berulang.
test('a navigation paints from the stored shell and refreshes behind it',()=>{
  const sw=read('sw.js');
  const nav=sw.slice(sw.indexOf('event.request.mode === "navigate"'),sw.indexOf('if (url.origin !== self.location.origin)'));
  assert.ok(nav.includes('caches.match("./index.html")'),'navigation does not read the stored shell');
  assert.ok(nav.indexOf('caches.match("./index.html")') < nav.indexOf('fetch(event.request)'),'navigation still waits on the network first');
  assert.ok(nav.includes('cache.put("./index.html"'),'the fresh shell is not written back');
  assert.ok(nav.includes('return cached || fresh'),'no fallback when both cache and network fail');
});
