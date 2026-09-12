import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness() {
  const elements=new Map();
  const $=id=>{if(!elements.has(id)) elements.set(id,{value:'admin',disabled:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},removeAttribute(){},requestSubmit(){this.submits=(this.submits||0)+1;}});return elements.get(id);};
  let resolveLogin, calls=0;
  const context=vm.createContext({$,document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},openLogin(){},leaveAdmin(){},saveBuilderCloud(){},api:{isConfigured:()=>true,login:()=>{calls++;return new Promise(r=>resolveLogin=r);}},enterAdmin:async()=>{},admin:false});
  vm.runInContext(source.slice(source.indexOf('function wireAdminEvents()'),source.indexOf('\nfunction checkedBuilderSchedule()')),context);
  context.wireAdminEvents();
  return {$,calls:()=>calls,resolve:()=>resolveLogin({})};
}
test('password Enter submits once, ignores composition and busy state',()=>{
  const {$}=harness();const handler=$('#loginPassword').handlers.keydown;
  const event={key:'Enter',preventDefault(){}};
  handler(event);assert.equal($('#loginForm').submits,1);
  handler({...event,isComposing:true});assert.equal($('#loginForm').submits,1);
  $('#submitLogin').disabled=true;handler(event);assert.equal($('#loginForm').submits,1);
});
test('login shows progress, rejects duplicate submissions and restores button',async()=>{
  const h=harness(), handler=h.$('#loginForm').handlers.submit;
  const pending=handler({preventDefault(){}});
  assert.equal(h.$('#submitLogin').textContent,'Sedang login…');
  await handler({preventDefault(){}});assert.equal(h.calls(),1);
  h.resolve();await pending;
  assert.equal(h.$('#submitLogin').disabled,false);assert.equal(h.$('#submitLogin').textContent,'Login');
});
test('builder is lazy-loaded outside the login path and appears only inside Jadual navigation',()=>{
  // The builder body is now loadBuilder(), wrapped by ensureBuilder() so the warm-up and the press
  // share one open; the marker follows the shared promise that starts that section.
  const openLogin=source.slice(source.indexOf('function openLogin()'),source.indexOf('\nlet builderReadyPromise'));
  const enterAdmin=source.slice(source.indexOf('async function enterAdmin'),source.indexOf('\nasync function leaveAdmin'));
  assert.ok(!openLogin.includes('ensureBuilder'));
  assert.ok(enterAdmin.includes('result.snapshot||await api.bootstrap(since)'),'enterAdmin must ask the server only for changes since the cached revision');
  assert.ok(!enterAdmin.includes('ensureBuilder'));
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const nav=html.slice(html.indexOf('<nav'),html.indexOf('</nav>'));
  assert.ok(!nav.includes('data-builder-open'));
  assert.ok(html.includes('data-schedule-mode="generator"'));
});
test('refresh restores a valid seven-day admin shell before network validation',()=>{
  const init=source.slice(source.indexOf('function init()'),source.indexOf('\ninit();'));
  const resume=source.slice(source.indexOf('async function resumeSession'),source.indexOf('\nfunction requireAdmin'));
  assert.ok(init.indexOf('restoreAdminShell(savedSession)')<init.indexOf('renderAll()'));
  assert.match(resume,/restoreAdminShell\(session\)/);
  assert.match(resume,/error\.code==='AUTH_REQUIRED'/);
  assert.match(resume,/restoreAdminShell\(session\);updateConnectionUi\(\)/);
});
