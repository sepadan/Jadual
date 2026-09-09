import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createHmac,randomUUID} from 'node:crypto';
function server() {
  const props=new Map(),cache=new Map();
  const propertyApi={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)};
  const context=vm.createContext({console,PropertiesService:{getScriptProperties:()=>propertyApi},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:randomUUID,computeHmacSha256Signature:(text,key)=>createHmac('sha256',key).update(text).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url')}});
  for(const file of ['Code.gs','Auth.gs','Builder.gs'])vm.runInContext(readFileSync(new URL(`../apps-script/${file}`,import.meta.url),'utf8'),context);
  context.output_=data=>data;context.initializeAdmin_();return {context,props,cache};
}
test('no session means all writes and private bootstrap are rejected',()=>{
  const {context}=server();
  for(const action of ['saveTeacher','saveBuilder','saveAbsence','saveReliefs','importSchedule','bootstrap','changePassword']) {
    const reply=context.doPost({postData:{contents:JSON.stringify({action,pin:'2468',data:{}})}});assert.equal(reply.ok,false);assert.equal(reply.code,'AUTH_REQUIRED');
  }
});
test('legacy GET bootstrap does not disclose private data',()=>{const {context}=server();assert.equal(context.doGet({parameter:{action:'bootstrap'}}).ok,false);});
test('web app opens only the configured database without active spreadsheet context',()=>{const {context,props}=server();assert.throws(()=>context.database_(),/setupSystem/);props.set('DATABASE_ID','school-database');context.SpreadsheetApp={openById:id=>({id})};assert.equal(context.database_().id,'school-database');});
test('only admin with the correct password receives a session',()=>{
  const {context}=server();assert.throws(()=>context.login_({username:'teacher',password:'admin'}));assert.throws(()=>context.login_({username:'admin',password:'wrong'}));
  const login=context.login_({username:'admin',password:'admin'});assert.ok(login.token);assert.equal(login.mustChangePassword,true);assert.doesNotThrow(()=>context.requireSession_(login.token));
  context.logout_(login.token);assert.throws(()=>context.requireSession_(login.token),/AUTH_REQUIRED/);
});
test('password change revokes existing sessions and requires current password',()=>{
  const {context}=server();const login=context.login_({username:'admin',password:'admin'});
  assert.throws(()=>context.changePassword_({currentPassword:'wrong',newPassword:'new-strong-password'}));
  context.changePassword_({currentPassword:'admin',newPassword:'new-strong-password'});assert.throws(()=>context.requireSession_(login.token));
  assert.equal(context.login_({username:'admin',password:'new-strong-password'}).mustChangePassword,false);
});
test('repeated wrong passwords are throttled',()=>{
  const {context}=server();for(let i=0;i<5;i++)assert.throws(()=>context.login_({username:'admin',password:'bad'}));assert.throws(()=>context.login_({username:'admin',password:'admin'}),/15 minit/);
});
test('public data omits absence reasons, drafts, private notes and teacher privileges',()=>{
  const {context}=server();context.bootstrap_=()=>({data:{teachers:[{id:'t',name:'Teacher',priority:1,position:'private'}],scheduleVersions:[{id:'v',status:'active'},{id:'draft',status:'draft'}],schedule:[{versionId:'v'},{versionId:'draft'}],absences:[{id:'a',reason:'private medical note',status:'active'}],reliefs:[{id:'r',status:'published',note:'private'},{id:'d',status:'draft'}],builder:{secret:'draft'}}});
  const data=context.publicBootstrap_().data;assert.equal(data.absences[0].reason,undefined);assert.equal(data.teachers[0].priority,undefined);assert.equal(data.reliefs[0].note,undefined);assert.equal(data.reliefs.length,1);assert.equal(data.schedule.length,1);assert.equal(data.builder,undefined);
});
test('builder saves reject stale revisions before replacing the sheet',()=>{const {context}=server();context.configValue_=()=>4;assert.throws(()=>context.saveBuilder_({baseRevision:3,state:{guru:[],kelas:[],subjek:[]}}),/peranti lain/);});
