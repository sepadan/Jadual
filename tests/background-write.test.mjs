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
  const context=vm.createContext({ApiClient,config:{},api:{token:'token'},admin:true,pendingWrites:0,failedWrites:0,writeQueue:Promise.resolve(),db:{revision:0},confirmedDb:{},structuredClone,updateConnectionUi(){},persist(){},toast(){},setTimeout(){},leaveAdmin(){}});
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

test('near-real-time sync checks a lightweight revision endpoint',()=>{
  assert.ok(source.includes('setInterval(syncIfChanged,8000)'));
  assert.ok(source.includes('const status=await api.status()'));
});
