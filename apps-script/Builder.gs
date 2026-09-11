function readBuilder_() {
  var revision=Number(configValue_('BUILDER_REVISION')||0);
  var rows=readObjects_('BuilderState').filter(function(row){return Number(row.revision)===revision;}).sort(function(a,b){return Number(a.index)-Number(b.index);});
  return {revision:revision,state:rows.length?parseJson_(rows.map(function(row){return String(row.chunk).replace(/^json:/,'');}).join(''),null):null};
}
function saveBuilder_(data) {
  var current=Number(configValue_('BUILDER_REVISION')||0);
  if(Number(data.baseRevision)!==current) throw new Error('Draf telah berubah pada peranti lain. Muat semula draf awan sebelum menyimpan.');
  var state=data.state;
  if(!state||!Array.isArray(state.guru)||!Array.isArray(state.kelas)||!Array.isArray(state.subjek)) throw new Error('Draf pembina tidak sah.');
  var json=JSON.stringify(state);if(json.length>2000000) throw new Error('Draf melebihi 2 MB. Kecilkan logo sekolah.');
  var chunks=[];for(var i=0;i<json.length;i+=30000) chunks.push([current+1,chunks.length,'json:'+json.slice(i,i+30000)]);
  var sheet=database_().getSheetByName('BuilderState');
  // Append before switching the committed revision. A failed write cannot erase the previous draft.
  var previous=readObjects_('BuilderState');
  for(var n=previous.length-1;n>=0;n--) if(Number(previous[n].revision)===current+1) sheet.deleteRow(n+2);
  if(chunks.length) sheet.getRange(sheet.getLastRow()+1,1,chunks.length,3).setValues(chunks);
  setConfig_('BUILDER_REVISION',String(current+1));audit_('saveBuilder','builder','Draf disimpan');return {builderRevision:current+1};
}
// The version a visitor needs today: an official (active) version always wins, even when an
// older import carries a later effective date. Superseded versions are only used before the
// first official version took effect.
function activePublicVersion_(versions, today) {
  var eligible = (versions || []).filter(function(version) {
    var day = dayOnly_(version.effectiveDate);
    return ['active', 'superseded'].indexOf(version.status) >= 0 && day && day <= today;
  });
  return latestVersion_(eligible.filter(function(version) { return version.status === 'active'; }))
    || latestVersion_(eligible.filter(function(version) { return version.status === 'superseded'; }))
    || null;
}

function latestVersion_(versions) {
  return versions.sort(function(a, b) {
    return dayOnly_(b.effectiveDate).localeCompare(dayOnly_(a.effectiveDate))
      || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  })[0];
}

// An old client selects the newest status "active" version and expects its rows, so while a new
// official version has been published but has not taken effect yet, both travel together. Once
// the new one is in force only that version is sent.
function publicVersions_(versions, today) {
  var effective = activePublicVersion_(versions, today);
  var official = latestVersion_((versions || []).filter(function(version) { return version.status === 'active'; }));
  if (!effective) return official ? [official] : [];
  if (!official || official.id === effective.id) return [effective];
  return [effective, official];
}

function publicBootstrap_() {
  var data=bootstrap_(-1).data;
  var today=Utilities.formatDate(new Date(),'Asia/Kuala_Lumpur','yyyy-MM-dd');
  var visibleVersions=publicVersions_(data.scheduleVersions,today);
  var visibleIds={};
  visibleVersions.forEach(function(version){visibleIds[String(version.id)]=true;});
  var activeAbsences=data.absences.filter(function(a){return a.status!=='cancelled';});
  function hasActiveAbsence_(relief) {
    return activeAbsences.some(function(absence) {
      var periods=(Array.isArray(absence.periods)?absence.periods:parseJson_(absence.periods,[])).map(Number);
      return absence.date===relief.date && absence.teacherId===relief.absentTeacherId
        && (bool_(absence.allDay)||periods.indexOf(Number(relief.period))>=0);
    });
  }
  function replacementIsAbsent_(relief) {
    return activeAbsences.some(function(absence) {
      var periods=(Array.isArray(absence.periods)?absence.periods:parseJson_(absence.periods,[])).map(Number);
      return absence.date===relief.date && absence.teacherId===relief.replacementTeacherId
        && (bool_(absence.allDay)||periods.indexOf(Number(relief.period))>=0);
    });
  }
  return {ok:true,data:{school:data.school,revision:data.revision,updatedAt:data.updatedAt,
    teachers:data.teachers.map(function(t){return {id:t.id,name:t.name,shortName:t.shortName,active:t.active};}),
    scheduleVersions:visibleVersions,
    schedule:data.schedule.filter(function(r){return visibleIds[String(r.versionId)]===true;}),
    absences:activeAbsences.map(function(a){return {id:a.id,date:a.date,teacherId:a.teacherId,allDay:a.allDay,periods:a.periods,status:a.status};}),
    reliefs:data.reliefs.filter(function(r){return r.status==='published'&&hasActiveAbsence_(r)&&!replacementIsAbsent_(r);}).map(function(r){return {id:r.id,date:r.date,day:r.day,period:r.period,startTime:r.startTime,endTime:r.endTime,absentTeacherId:r.absentTeacherId,replacementTeacherId:r.replacementTeacherId,className:r.className,subject:r.subject,status:r.status};})
  }};
}

// Serves the cached payload for the current revision, and answers a visitor who already holds
// that revision with a tiny "unchanged" reply instead of the whole timetable.
function publicBootstrapCached_(e) {
  var revision=Number(configValue_('DATA_REVISION')||0);
  var since=Number((e&&e.parameter&&e.parameter.revision)||0);
  var today=Utilities.formatDate(new Date(),'Asia/Kuala_Lumpur','yyyy-MM-dd');
  var asked=(e&&e.parameter&&e.parameter.day)||today;
  // The payload depends on the calendar day because a version takes effect at midnight, so the
  // cache entry and the "unchanged" answer both expire with the day.
  var key='public:'+revision+':'+today;
  if(since>0&&since===revision&&String(asked)===today) return {ok:true,changed:false,revision:revision,updatedAt:configValue_('UPDATED_AT')||''};
  var cache=null;
  try {cache=CacheService.getScriptCache();} catch (error) {cache=null;}
  if(cache) {
    var hit=cache.get(key);
    if(hit) {try {return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(hit))).getDataAsString());} catch (error) {}}
  }
  var payload=publicBootstrap_();
  if(cache&&payload&&payload.ok) {
    try {
      // base64Encode accepts bytes or a string, never a Blob.
      var encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(payload),'application/json','public.json')).getBytes());
      if(encoded.length<95000) cache.put(key,encoded,120);
    } catch (error) {}
  }
  return payload;
}
