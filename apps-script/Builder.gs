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
function publicBootstrap_() {
  var data=bootstrap_(-1).data;
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
    scheduleVersions:data.scheduleVersions.filter(function(v){return v.status==='active'||v.status==='superseded';}),
    schedule:data.schedule.filter(function(r){return data.scheduleVersions.some(function(v){return v.id===r.versionId&&(v.status==='active'||v.status==='superseded');});}),
    absences:activeAbsences.map(function(a){return {id:a.id,date:a.date,teacherId:a.teacherId,allDay:a.allDay,periods:a.periods,status:a.status};}),
    reliefs:data.reliefs.filter(function(r){return r.status==='published'&&hasActiveAbsence_(r)&&!replacementIsAbsent_(r);}).map(function(r){return {id:r.id,date:r.date,day:r.day,period:r.period,startTime:r.startTime,endTime:r.endTime,absentTeacherId:r.absentTeacherId,replacementTeacherId:r.replacementTeacherId,className:r.className,subject:r.subject,status:r.status};})
  }};
}
