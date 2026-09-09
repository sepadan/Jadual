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
