// Server-only authentication: credentials never go in Sheets or GitHub client configuration.
function initializeAdmin_() {
  var props=PropertiesService.getScriptProperties();
  if(!props.getProperty('AUTH_SECRET')) props.setProperty('AUTH_SECRET',Utilities.getUuid()+Utilities.getUuid());
  if(!props.getProperty('ADMIN_HASH')) props.setProperty('ADMIN_HASH',passwordHash_('admin'));
  props.deleteProperty('ADMIN_PIN');
}
function passwordHash_(password) {
  var secret=PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if(!secret) throw new Error('Jalankan setupSystem dahulu.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(password),secret));
}
function equalSecret_(a,b) {a=String(a||'');b=String(b||'');var diff=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function login_(data) {
  var cache=CacheService.getScriptCache(),lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(cache.get('login-blocked')) throw new Error('Terlalu banyak percubaan. Cuba selepas 15 minit.');
    var expected=PropertiesService.getScriptProperties().getProperty('ADMIN_HASH');
    if(data.username!=='admin'||!expected||!equalSecret_(passwordHash_(data.password||''),expected)) {
      var count=Number(cache.get('login-fail')||0)+1;cache.put('login-fail',String(count),900);
      if(count>=5) cache.put('login-blocked','1',900);throw new Error('Nama pengguna atau kata laluan tidak sah.');
    }
    cache.remove('login-fail');var token=Utilities.getUuid()+Utilities.getUuid(),expiresAt=Date.now()+7*24*60*60*1000;
    var props=PropertiesService.getScriptProperties(), sessions=(parseJson_(props.getProperty('ADMIN_SESSIONS'),{})||{}),epoch=props.getProperty('AUTH_EPOCH')||'0';
    Object.keys(sessions).forEach(function(key){if(sessions[key].expiresAt<=Date.now()||sessions[key].epoch!==epoch) delete sessions[key];});
    var keys=Object.keys(sessions).sort(function(a,b){return sessions[a].expiresAt-sessions[b].expiresAt;});
    while(keys.length>=20) delete sessions[keys.shift()];
    sessions[passwordHash_(token)]={expiresAt:expiresAt,epoch:epoch};
    props.setProperty('ADMIN_SESSIONS',JSON.stringify(sessions));
    return {ok:true,token:token,expiresAt:expiresAt,mustChangePassword:equalSecret_(expected,passwordHash_('admin'))};
  } finally {lock.releaseLock();}
}
function requireSession_(token) {
  if(!token||typeof token!=='string'||token.length>200) throw new Error('AUTH_REQUIRED');
  var session=(parseJson_(PropertiesService.getScriptProperties().getProperty('ADMIN_SESSIONS'),{})||{})[passwordHash_(token)];
  if(!session||session.expiresAt<=Date.now()||session.epoch!==(PropertiesService.getScriptProperties().getProperty('AUTH_EPOCH')||'0')) throw new Error('AUTH_REQUIRED');
}
function logout_(token) {
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {var props=PropertiesService.getScriptProperties(),sessions=(parseJson_(props.getProperty('ADMIN_SESSIONS'),{})||{});delete sessions[passwordHash_(token)];props.setProperty('ADMIN_SESSIONS',JSON.stringify(sessions));return {ok:true};}
  finally {lock.releaseLock();}
}
function changePassword_(data) {
  var props=PropertiesService.getScriptProperties();
  if(!equalSecret_(passwordHash_(data.currentPassword||''),props.getProperty('ADMIN_HASH'))) throw new Error('Kata laluan semasa tidak sah.');
  if(typeof data.newPassword!=='string'||data.newPassword.length<12) throw new Error('Gunakan sekurang-kurangnya 12 aksara.');
  props.setProperty('ADMIN_HASH',passwordHash_(data.newPassword));props.setProperty('AUTH_EPOCH',Utilities.getUuid());return {changed:true};
}
