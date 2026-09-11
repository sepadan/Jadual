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
  for(const action of ['saveTeacher','saveBuilder','saveAbsence','cancelAbsence','saveReliefs','importSchedule','bootstrap','changePassword']) {
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
test('login can return the data snapshot in the same request',()=>{
  const {context}=server();context.bootstrap_=()=>({ok:true,data:{teachers:[{id:'t1'}]}});
  const reply=context.doPost({postData:{contents:JSON.stringify({action:'login',data:{username:'admin',password:'admin',includeBootstrap:true}})}});
  assert.equal(reply.ok,true);assert.equal(reply.snapshot.data.teachers[0].id,'t1');
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
  const {context}=server();context.bootstrap_=()=>({data:{teachers:[{id:'t',name:'Teacher',priority:1,position:'private'}],scheduleVersions:[{id:'v',status:'active'},{id:'draft',status:'draft'}],schedule:[{versionId:'v'},{versionId:'draft'}],absences:[{id:'a',date:'2026-09-09',teacherId:'t',allDay:true,periods:[],reason:'private medical note',status:'active'}],reliefs:[{id:'r',date:'2026-09-09',period:1,absentTeacherId:'t',status:'published',note:'private'},{id:'d',date:'2026-09-09',period:2,absentTeacherId:'t',status:'draft'}],builder:{secret:'draft'}}});
  const data=context.publicBootstrap_().data;assert.equal(data.absences[0].reason,undefined);assert.equal(data.teachers[0].priority,undefined);assert.equal(data.reliefs[0].note,undefined);assert.equal(data.reliefs.length,1);assert.equal(data.schedule.length,1);assert.equal(data.builder,undefined);
});
test('builder saves reject stale revisions before replacing the sheet',()=>{const {context}=server();context.configValue_=()=>4;assert.throws(()=>context.saveBuilder_({baseRevision:3,state:{guru:[],kelas:[],subjek:[]}}),/peranti lain/);});

test('seven-day session survives cache eviction and expires server-side',()=>{
  const {context,props,cache}=server();const before=Date.now();const login=context.login_({username:'admin',password:'admin'});
  assert.ok(login.expiresAt>=before+7*24*60*60*1000);cache.clear();assert.doesNotThrow(()=>context.requireSession_(login.token));
  const sessions=JSON.parse(props.get('ADMIN_SESSIONS'));Object.values(sessions).forEach(s=>s.expiresAt=Date.now()-1);props.set('ADMIN_SESSIONS',JSON.stringify(sessions));
  assert.throws(()=>context.requireSession_(login.token),/AUTH_REQUIRED/);
});
test('server rejects over-limit relief batch before any write',()=>{
  const {context}=server();let writes=0;context.configValue_=()=>'';context.readObjects_=name=>name==='Absences'?[{date:'2026-09-09',teacherId:'absent',allDay:true,status:'active'}]:[];context.upsert_=()=>writes++;
  const rows=[1,2,3].map(period=>({id:String(period),date:'2026-09-09',period,absentTeacherId:'absent',replacementTeacherId:'g',status:'published'}));
  assert.throws(()=>context.routeWrite_('saveReliefs',rows),/Had relief/);assert.equal(writes,0);
  context.configValue_=()=>3;context.audit_=()=>{};assert.equal(context.routeWrite_('saveReliefs',rows).count,3);
});

test('server refuses to publish relief after its absence was cancelled',()=>{
  const {context}=server();context.readObjects_=()=>[];
  assert.throws(()=>context.routeWrite_('saveReliefs',[{id:'r',date:'2026-09-09',period:2,absentTeacherId:'g1',replacementTeacherId:'g2',status:'published'}]),/telah dipadam/);
});

test('legacy orphan reliefs do not consume the daily server limit',()=>{
  const {context}=server();let writes=0;
  context.configValue_=key=>key==='RELIEF_DAILY_LIMIT'?'2':'';
  context.readObjects_=name=>name==='Absences'
    ?[{date:'2026-09-09',teacherId:'active-away',allDay:true,status:'active'}]
    :name==='Reliefs'?[1,2].map(period=>({id:`old-${period}`,date:'2026-09-09',period,absentTeacherId:'deleted-away',replacementTeacherId:'cover',status:'published'})):[];
  context.upsert_=()=>writes++;context.audit_=()=>{};
  const rows=[3,4].map(period=>({id:`new-${period}`,date:'2026-09-09',period,absentTeacherId:'active-away',replacementTeacherId:'cover',status:'published'}));
  assert.equal(context.routeWrite_('saveReliefs',rows).count,2);
  assert.equal(writes,2);
});

test('server cancels an absence and all related reliefs atomically',()=>{
  const {context}=server();
  const rows={
    Absences:[{id:'a1',date:'2026-09-09',teacherId:'g1',allDay:true,periods:[],status:'active'}],
    Reliefs:[
      {id:'r1',date:'2026-09-09',absentTeacherId:'g1',status:'published'},
      {id:'r2',date:'2026-09-09',absentTeacherId:'g2',status:'published'},
    ],
  };
  const writes=[];
  context.readObjects_=name=>rows[name]||[];
  context.upsert_=(sheet,key,row)=>writes.push({sheet,row});
  context.audit_=()=>{};
  const result=context.routeWrite_('cancelAbsence',{id:'a1',updatedAt:'now'});
  assert.equal(result.reliefCount,1);
  assert.deepEqual(writes.map(item=>item.sheet),['Absences','Reliefs']);
  assert.equal(writes[0].row[6],'cancelled');
  assert.equal(writes[1].row[10],'cancelled');
  assert.throws(()=>context.routeWrite_('cancelAbsence',{id:'missing'}),/tidak ditemui/);
});
