import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('ordinary actions are not blocked while Sheets saves in the background',()=>{
  const requireAdmin=source.slice(source.indexOf('function requireAdmin()'),source.indexOf('\nfunction openLogin()'));
  assert.ok(!requireAdmin.includes('pendingWrites'));
  assert.ok(!source.includes('writeBusy'));
  for(const call of [
    'remoteWrite("saveAbsence", absence, message);',
    'remoteWrite("cancelAbsence", { id, updatedAt }, message);',
    'remoteWrite("saveTeacher", teacher, "Maklumat guru disimpan.");',
    'remoteWrite("saveReliefs", records, `${records.length} relief diterbitkan.',
  ]) assert.ok(source.includes(call));
});

test('background writes stay sequential even when queued immediately',async()=>{
  const fn=source.slice(source.indexOf('function remoteWrite('),source.indexOf('\nasync function syncData'));
  const starts=[],finishes=[],resolvers=[];
  class ApiClient {
    constructor(){this.token='';}
    write(action){starts.push(action);return new Promise(resolve=>resolvers.push(()=>{finishes.push(action);resolve({revision:finishes.length,updatedAt:'now'});}));}
  }
  const context=vm.createContext({ApiClient,config:{},api:{token:'token'},admin:true,pendingWrites:0,failedWrites:0,writeQueue:Promise.resolve(),writeOutbox:[],db:{revision:0},confirmedDb:{},structuredClone,uuid(){return `w-${Math.random()}`},saveWriteOutbox(){},cacheAdminDb(){},updateConnectionUi(){},persist(){},toast(){},setTimeout(){},leaveAdmin(){},navigator:{onLine:true}});
  vm.runInContext(fn,context);
  const first=context.remoteWrite('first',{},'');
  const second=context.remoteWrite('second',{},'');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(starts,['first']);
  resolvers.shift()();await first;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(starts,['first','second']);
  resolvers.shift()();await second;
  assert.deepEqual(finishes,['first','second']);
});

test('failed network writes survive and retry from the same durable outbox entry',async()=>{
  const fn=source.slice(source.indexOf('function remoteWrite('),source.indexOf('\nasync function syncData'));
  let attempts=0;
  class ApiClient {
    constructor(){this.token='';}
    write(){attempts+=1;return attempts===1?Promise.reject(new Error('offline')):Promise.resolve({revision:9,updatedAt:'now'});}
  }
  const stored=[];
  const context=vm.createContext({ApiClient,config:{},api:{token:'token'},admin:true,pendingWrites:0,failedWrites:0,writeQueue:Promise.resolve(),writeOutbox:[],db:{revision:1},confirmedDb:{},structuredClone,uuid(){return 'w-one'},saveWriteOutbox(){stored.push(JSON.stringify(context.writeOutbox))},cacheAdminDb(){},updateConnectionUi(){},persist(){},toast(){},setTimeout(){},leaveAdmin(){},navigator:{onLine:true},Promise});
  vm.runInContext(fn,context);
  assert.equal(await context.remoteWrite('saveTeacher',{id:'g-1'},''),false);
  assert.equal(context.writeOutbox.length,1);
  assert.equal(await context.retryStoredWrites(),true);
  assert.equal(context.writeOutbox.length,0);
  assert.equal(attempts,2);
  assert.ok(stored.some(value=>value.includes('saveTeacher')));
});

test('persist writes the optimistic database to the device before Sheets responds',()=>{
  const fn=source.slice(source.indexOf('function persist()'),source.indexOf('\nfunction toast'));
  const order=[];
  const context=vm.createContext({db:{},cacheAdminDb(){order.push('device')},updateConnectionUi(){order.push('ui')},Date});
  vm.runInContext(fn,context);context.persist();
  assert.deepEqual(order,['device','ui']);
});

test('a remote write enters the durable device outbox before its network request starts',async()=>{
  assert.ok(source.includes('const WRITE_OUTBOX_KEY'));
  assert.ok(source.includes('saveWriteOutbox();cacheAdminDb();'));
  assert.ok(source.indexOf('saveWriteOutbox();cacheAdminDb();') < source.indexOf('client.write(action,payload)'));
});

test('failed writes remain in the device outbox and are retried after the admin session resumes',()=>{
  assert.match(source,/function retryStoredWrites\(\)/);
  assert.match(source,/retryStoredWrites\(\)\.then\(\(saved\) => \{ if \(saved\) syncData\(false\); \}\);/);
  assert.match(source,/localStorage\.setItem\(WRITE_OUTBOX_KEY/);
  assert.match(source,/writeOutbox\.filter\(\(item\) => item\.id !== entry\.id\)/);
});

test('manual synchronization flushes the device outbox before reading from Sheets',()=>{
  const sync=source.slice(source.indexOf('async function syncData'),source.indexOf('\nasync function syncIfChanged'));
  assert.ok(sync.indexOf('await retryStoredWrites()') < sync.indexOf('await api.bootstrap()'));
  assert.ok(!sync.includes('use server'));
});

test('near-real-time sync checks a lightweight revision endpoint',()=>{
  assert.ok(source.includes('setInterval(syncIfChanged,8000)'));
  assert.ok(source.includes('const status=await api.status()'));
});
