
/* ============================================================
   JanaJadual — Sistem Jadual Waktu Sekolah
   Fail HTML tunggal. Data disimpan dalam pelayar (localStorage).
   ============================================================ */
"use strict";

/* ---------- Utiliti ---------- */
const $  = (s,r=document.getElementById("builderRoot"))=>r.querySelector(s);
const $$ = (s,r=document.getElementById("builderRoot"))=>Array.from(r.querySelectorAll(s));
const uid = ()=>Math.random().toString(36).slice(2,10);
const esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o=>JSON.parse(JSON.stringify(o));
const num = (v,d=0)=>{const n=parseInt(v,10);return isNaN(n)?d:n;};
const HARI_PENDEK={ISNIN:'IS',SELASA:'SEL',RABU:'RAB',KHAMIS:'KHA',JUMAAT:'JUM',SABTU:'SAB',AHAD:'AHD'};
const PALET=['#ffd9d9','#ffe7c7','#fff6bf','#e2f7c4','#c9f2e3','#c9ecff','#d7dcff','#ecd7ff','#ffd7ef','#e6e6e6','#d9f0d1','#ffe0b2'];

function toast(msg,kind='ok',ms=2600){
  let t=$('#toastBox');
  if(!t){t=document.createElement('div');t.id='toastBox';
    t.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:200;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    document.getElementById("builderRoot").appendChild(t);}
  const d=document.createElement('div');
  const bg=kind==='bad'?'var(--bad)':kind==='warn'?'var(--warn)':'var(--ok)';
  d.style.cssText=`background:${bg};color:#fff;padding:9px 16px;border-radius:99px;font-size:13.5px;font-weight:600;box-shadow:0 8px 26px rgba(0,0,0,.25);max-width:90vw`;
  d.textContent=msg;t.appendChild(d);
  setTimeout(()=>{d.style.transition='opacity .3s';d.style.opacity='0';setTimeout(()=>d.remove(),320);},ms);
}
function ask(html,onYes,yesLabel='Ya, teruskan',danger=true){
  $('#dlgBody').innerHTML=`<h3>Pengesahan</h3><p>${html}</p>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" id="dNo">Batal</button>
      <button class="btn ${danger?'dgr':'pri'}" id="dYes">${esc(yesLabel)}</button></div>`;
  const d=$('#dlg');d.showModal();
  $('#dNo').onclick=()=>d.close();
  $('#dYes').onclick=()=>{d.close();onYes();};
}

/* ---------- Keadaan lalai ---------- */
function kosong(){
  return {
    v:3,
    sekolah:{nama:'', tajukGuru:'JADUAL WAKTU PERSENDIRIAN GURU', tajukKelas:'JADUAL WAKTU KELAS',
             tahun:new Date().getFullYear().toString(), bermula:'', gb:'', gbGelaran:'GURU BESAR', logo1:'', logo2:''},
    masa:{ mula:'07:30', tempoh:30,
           waktu:{ISNIN:12,SELASA:12,RABU:12,KHAMIS:12,JUMAAT:12},
           rehat:[{selepas:5,minit:20,label:'REHAT'}],
           pra:{aktif:true,label:'PENGURUSAN',mula:'07:20',tempoh:10} },
    hari:['ISNIN','SELASA','RABU','KHAMIS','JUMAAT'],
    subjek:[], kelas:[], guru:[],
    peruntukan:{}, agihan:[], acara:[],
    kekangan:{ maxHariGuru:8, maxBerturut:4, maxSubjekSehari:3, terasPagi:true,
               elakLubang:true, elakAkhirTeras:true, sebarHari:true, kapasiti:{}, cubaan:60 },
    jadual:null
  };
}
let S = kosong();
let VIEW='dash';

/* ---------- Storan ---------- */
const KEY='janajadual.v3';
let memOnly=false;
function simpan(quiet){
  const el=$('#saveState');
  if(el){el.textContent='Draf';el.className='pill';}
  document.dispatchEvent(new CustomEvent("builder-saved"));
}
function muat(){
  try{
    const raw=localStorage.getItem(KEY);
    if(raw){ const o=JSON.parse(raw); S=Object.assign(kosong(),o); S.masa=Object.assign(kosong().masa,o.masa||{});
      S.kekangan=Object.assign(kosong().kekangan,o.kekangan||{}); S.sekolah=Object.assign(kosong().sekolah,o.sekolah||{});
      return true; }
  }catch(e){ memOnly=true; }
  return false;
}

/* ---------- Pengiraan masa ---------- */
function mm(hhmm){ const [h,m]=String(hhmm||'0:0').split(':').map(Number); return (h||0)*60+(m||0); }
function hm(t){ t=((t%1440)+1440)%1440; const h=Math.floor(t/60), m=t%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function maxWaktu(){ return Math.max(...S.hari.map(h=>num(S.masa.waktu[h],0)),0); }
function rehatSelepas(){ const m={}; (S.masa.rehat||[]).forEach(r=>{ m[num(r.selepas)]=r; }); return m; }
/** Senarai { p, mula, tamat } untuk waktu 1..N + rehat */
function jalurMasa(){
  const N=maxWaktu(), reh=rehatSelepas(), out=[]; let t=mm(S.masa.mula);
  for(let p=1;p<=N;p++){
    out.push({p, mula:hm(t), tamat:hm(t+num(S.masa.tempoh,30))});
    t+=num(S.masa.tempoh,30);
    if(reh[p]) t+=num(reh[p].minit,0);
  }
  return out;
}
function masaRehat(p){
  const reh=rehatSelepas(); if(!reh[p]) return null;
  const jm=jalurMasa(); const a=jm.find(x=>x.p===p);
  return {mula:a.tamat, tamat:hm(mm(a.tamat)+num(reh[p].minit,0)), label:reh[p].label||'REHAT'};
}
/** Adakah waktu p adalah "pagi" (sebelum rehat pertama) */
function waktuPagi(p){
  const r=(S.masa.rehat||[]).map(x=>num(x.selepas)).sort((a,b)=>a-b);
  return r.length? p<=r[0] : p<=Math.ceil(maxWaktu()/2);
}
function waktuHari(h){ return num(S.masa.waktu[h], maxWaktu()); }

/* ---------- Carian ---------- */
const byId=(arr,id)=>arr.find(x=>x.id===id);
const subjekById=id=>byId(S.subjek,id);
const kelasById =id=>byId(S.kelas,id);
const guruById  =id=>byId(S.guru,id);
function namaGuru(id,pendek){ const g=guruById(id); if(!g) return '—'; return pendek? (g.kod||g.nama) : g.nama; }
function kodSubjek(id){ const s=subjekById(id); return s?s.kod:'?'; }
function namaKelas(id){ const k=kelasById(id); return k?k.nama:'?'; }
function warnaSubjek(id){ const s=subjekById(id); return s?(s.warna||'#e6e6e6'):'#e6e6e6'; }

/* Peruntukan waktu untuk kelas+subjek (ikut tahap, boleh diganti pada agihan) */
function waktuDiperuntuk(kelasId, subjekId){
  const k=kelasById(kelasId); if(!k) return 0;
  const p=S.peruntukan[subjekId]; if(!p) return 0;
  return num(p[k.tahap],0);
}
function agihanUntuk(kelasId,subjekId){ return S.agihan.find(a=>a.kelasId===kelasId&&a.subjekId===subjekId); }
function waktuEfektif(a){
  if(!a) return 0;
  if(a.waktu!=null && a.waktu!=='' ) return num(a.waktu,0);
  return waktuDiperuntuk(a.kelasId,a.subjekId);
}
/** Segerakkan agihan dengan senarai kelas × subjek yang ada peruntukan */
function segerakAgihan(){
  const perlu=new Set();
  S.kelas.forEach(k=>S.subjek.forEach(s=>{
    if(waktuDiperuntuk(k.id,s.id)>0) perlu.add(k.id+'|'+s.id);
  }));
  // buang yang tidak perlu (kecuali ada waktu override)
  S.agihan=S.agihan.filter(a=>perlu.has(a.kelasId+'|'+a.subjekId) || num(a.waktu,0)>0);
  const guruSah=new Set(S.guru.map(g=>g.id));
  S.agihan.forEach(a=>{
    a.pairGuruIds=[...new Set(Array.isArray(a.pairGuruIds)?a.pairGuruIds:[])].filter(id=>id!==a.guruId&&guruSah.has(id));
  });
  // tambah yang tiada
  perlu.forEach(key=>{
    const [kelasId,subjekId]=key.split('|');
    if(!agihanUntuk(kelasId,subjekId)) S.agihan.push({id:uid(),kelasId,subjekId,guruId:'',pairGuruIds:[],waktu:'',ganda:0});
  });
}

/* ---------- Data contoh (SK Paya Redan) ---------- */
function dataContoh(){
  const st=kosong();
  st.sekolah={nama:'SK PAYA REDAN, MUAR', tajukGuru:'JADUAL WAKTU PERSENDIRIAN GURU',
    tajukKelas:'JADUAL WAKTU KELAS', tahun:'2026', bermula:'2026-01-12', gb:'TN HJ KHAIRUL IZAM BIN ABD SAMAD',
    gbGelaran:'GURU BESAR', logo1:'', logo2:''};
  const sub=(kod,nama,warna,opt={})=>({id:uid(),kod,nama,warna,teras:!!opt.teras,pagi:!!opt.pagi,
    kemudahan:opt.kem||'',ganda:!!opt.ganda});
  const BM=sub('BM','Bahasa Melayu','#ffd9d9',{teras:1,pagi:1});
  const BI=sub('BI','Bahasa Inggeris','#c9ecff',{teras:1,pagi:1});
  const MT=sub('MATE','Matematik','#fff6bf',{teras:1,pagi:1});
  const SN=sub('SN','Sains','#c9f2e3',{teras:1,pagi:1});
  const PI=sub('PI','Pendidikan Islam','#e2f7c4',{teras:1});
  const SEJ=sub('SEJ','Sejarah','#ffe7c7',{});
  const RBT=sub('RBT','Reka Bentuk & Teknologi','#d7dcff',{ganda:1});
  const PSV=sub('PSV','Pendidikan Seni Visual','#ffd7ef',{ganda:1});
  const PM=sub('PM','Pendidikan Muzik','#ecd7ff',{});
  const PJ=sub('PJ','Pendidikan Jasmani','#d9f0d1',{kem:'PADANG'});
  const PK=sub('PK','Pendidikan Kesihatan','#e6e6e6',{});
  st.subjek=[BM,BI,MT,SN,PI,SEJ,RBT,PSV,PM,PJ,PK];
  const P=(s,o)=>{st.peruntukan[s.id]=o;};
  P(BM,{1:12,2:12,3:12,4:8,5:8,6:8});
  P(BI,{1:8,2:8,3:8,4:6,5:6,6:6});
  P(MT,{1:8,2:8,3:8,4:6,5:6,6:6});
  P(SN,{1:3,2:3,3:3,4:4,5:4,6:4});
  P(PI,{1:6,2:6,3:6,4:6,5:6,6:6});
  P(SEJ,{4:3,5:3,6:3});
  P(RBT,{4:2,5:2,6:2});
  P(PSV,{1:2,2:2,3:2,4:2,5:2,6:2});
  P(PM,{1:2,2:2,3:2,4:1,5:1,6:1});
  P(PJ,{1:2,2:2,3:2,4:2,5:2,6:2});
  P(PK,{1:1,2:1,3:1,4:1,5:1,6:1});
  const kls=[['1 CERDIK',1],['2 CERDIK',2],['3 CERDIK',3],['4 BIJAK',4],['5 CERDIK',5],['6 BIJAK',6]];
  st.kelas=kls.map(([nama,tahap])=>({id:uid(),nama,tahap,guruKelas:''}));
  const nama=['MOHAMAD AZIZI BIN BASRI','NORHAYATI BINTI OSMAN','AHMAD FAIZAL BIN OMAR','SITI AMINAH BINTI HASSAN',
    'ROSLI BIN ABDULLAH','NURUL HUDA BINTI ISMAIL','KAMARUDIN BIN YUSOF','ZURAIDA BINTI SALLEH',
    'MOHD HAFIZ BIN RAHIM','LATIFAH BINTI MAT','SHAHRUL NIZAM BIN AZIZ','FARIDAH BINTI JAAFAR'];
  st.guru=nama.map((n,i)=>({id:uid(),nama:n,gelaran:i%2?'PN':'EN',
    kod:n.split(' ')[0].slice(0,4)+(i+1), maxHari:8, tidakAda:[]}));
  st.kelas.forEach((k,i)=>k.guruKelas=st.guru[i%st.guru.length].id);
  st.acara=[
    {id:uid(),nama:'Perhimpunan',kod:'PER',warna:'#ffe7c7',hari:'ISNIN',mula:1,panjang:1,skop:'semua',guru:[],kelas:[]},
    {id:uid(),nama:'Program 1M1S',kod:'1M1S',warna:'#c9ecff',hari:'SELASA',mula:1,panjang:2,skop:'semua',guru:[],kelas:[]},
    {id:uid(),nama:'Kokurikulum',kod:'KOKU',warna:'#d9f0d1',hari:'RABU',mula:11,panjang:2,skop:'semua',guru:[],kelas:[]},
    {id:uid(),nama:'Bacaan Al-Quran',kod:'B.ALQ',warna:'#e2f7c4',hari:'JUMAAT',mula:1,panjang:1,skop:'semua',guru:[],kelas:[]}
  ];
  st.masa.waktu={ISNIN:12,SELASA:12,RABU:12,KHAMIS:12,JUMAAT:10};
  // agihan guru: pusing-pusing supaya tiada guru terlebih
  return st;
}
function autoAgihGuru(){
  segerakAgihan();
  const beban={}; S.guru.forEach(g=>beban[g.id]=0);
  const maxMinggu=Math.max(20, Math.ceil(S.agihan.reduce((s,a)=>s+waktuEfektif(a),0)/Math.max(1,S.guru.length))+4);
  // kumpul ikut kelas supaya seorang guru pegang beberapa subjek dalam kelas sama
  const byKelas={}; S.agihan.forEach(a=>{ (byKelas[a.kelasId]=byKelas[a.kelasId]||[]).push(a); });
  const guruKelasSet={};
  Object.keys(byKelas).forEach(kid=>{
    byKelas[kid].sort((a,b)=>waktuEfektif(b)-waktuEfektif(a));
    byKelas[kid].forEach(a=>{
      if(a.guruId) {
        [a.guruId,...(a.pairGuruIds||[])].forEach(id=>beban[id]=(beban[id]||0)+waktuEfektif(a));
        return;
      }
      // guru yang belum ajar subjek ini pada waktu sama & beban paling rendah
      const cand=S.guru.slice().sort((x,y)=>(beban[x.id]||0)-(beban[y.id]||0));
      const pilih=cand.find(g=>(beban[g.id]||0)+waktuEfektif(a)<=maxMinggu)||cand[0];
      a.guruId=pilih.id; a.pairGuruIds=(a.pairGuruIds||[]).filter(id=>id!==pilih.id); beban[pilih.id]=(beban[pilih.id]||0)+waktuEfektif(a);
      guruKelasSet[kid]=guruKelasSet[kid]||pilih.id;
    });
  });
}


/* ============================================================
   PENGHALA (ROUTER) & PAPARAN ASAS
   ============================================================ */
const VIEWS={};
function go(v){
  VIEW=v;
  $$('#nav .navbtn').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  const def=VIEWS[v]||VIEWS.dash;
  $('#vTitle').textContent=def.t;
  $('#content').innerHTML=def.r();
  if(def.after) def.after();
  window.scrollTo(0,0);
  $('#side').classList.remove('open'); $('#scrim')&&$('#scrim').remove();
  kiraKaunter();
  document.dispatchEvent(new CustomEvent('builder-view', {detail:v}));
}
function ulang(){ go(VIEW); }
function kiraKaunter(){
  $('#cSub')&&($('#cSub').textContent=S.subjek.length);
  $('#cKls')&&($('#cKls').textContent=S.kelas.length);
  $('#cGur')&&($('#cGur').textContent=S.guru.length);
}
function ubah(fn){ fn(); simpan(true); }

/* ---------- Statistik ---------- */
function stat(){
  segerakAgihan();
  let jumWaktu=0, tanpaGuru=0;
  const bebanGuru={}; S.guru.forEach(g=>bebanGuru[g.id]=0);
  S.agihan.forEach(a=>{ const w=waktuEfektif(a); jumWaktu+=w;
    if(!a.guruId) tanpaGuru+=w; else [a.guruId,...(a.pairGuruIds||[])].forEach(id=>bebanGuru[id]=(bebanGuru[id]||0)+w); });
  const kapasiti=S.hari.reduce((s,h)=>s+waktuHari(h),0)*S.kelas.length;
  const acaraBlok=(S.acara||[]).filter(a=>a.skop==='semua').reduce((s,a)=>s+num(a.panjang,1),0)*S.kelas.length;
  return {jumWaktu,tanpaGuru,bebanGuru,kapasiti,acaraBlok,baki:kapasiti-acaraBlok-jumWaktu};
}
function bilJadual(){ return S.jadual&&S.jadual.slots?S.jadual.slots.length:0; }

/* ============================================================
   PAPAN UTAMA
   ============================================================ */
VIEWS.dash={t:'Papan Utama', r(){
  const st=stat();
  const sedia = S.subjek.length&&S.kelas.length&&S.guru.length;
  const masalah=[];
  if(!S.sekolah.nama) masalah.push('Nama sekolah belum diisi (Tetapan Sekolah).');
  if(!S.subjek.length) masalah.push('Belum ada subjek.');
  if(!S.kelas.length) masalah.push('Belum ada kelas.');
  if(!S.guru.length) masalah.push('Belum ada guru.');
  if(st.jumWaktu===0&&S.subjek.length) masalah.push('Peruntukan waktu masih kosong — isi di <b>Peruntukan Waktu</b>.');
  if(st.tanpaGuru>0) masalah.push(`<b>${st.tanpaGuru} waktu</b> belum ada guru — lengkapkan di <b>Agihan Guru</b>.`);
  if(st.baki<0) masalah.push(`Peruntukan melebihi kapasiti sebanyak <b>${-st.baki} waktu</b>. Kurangkan waktu subjek atau tambah waktu harian.`);
  return `
  ${!sedia?`<div class="card"><h3>👋 Selamat datang</h3>
    <p class="hint">Sistem ini menjana jadual waktu sekolah secara automatik: masukkan guru, kelas, subjek dan bilangan waktu mengikut tahun, kemudian tekan <b>Jana</b>. Ia mengelakkan pertembungan guru &amp; kelas, dan menghasilkan jadual persendirian guru, jadual kelas dan jadual induk yang boleh dicetak A4 landskap.</p>
    <div class="row">
      <button class="btn pri" onclick="muatContoh()">📦 Muatkan data contoh</button>
      <button class="btn" onclick="go('tetapan')">⚙️ Mula dari kosong</button>
    </div></div>`:''}

  <div class="card"><h3>Ringkasan</h3>
    <div class="kpi">
      <div class="k"><b>${S.kelas.length}</b><span>Kelas</span></div>
      <div class="k"><b>${S.guru.length}</b><span>Guru</span></div>
      <div class="k"><b>${S.subjek.length}</b><span>Subjek</span></div>
      <div class="k"><b>${st.jumWaktu}</b><span>Waktu / minggu</span></div>
      <div class="k"><b>${st.baki}</b><span>Slot kosong tinggal</span></div>
      <div class="k"><b>${bilJadual()}</b><span>Blok dijadualkan</span></div>
    </div>
  </div>

  ${masalah.length?`<div class="card"><h3>⚠️ Perlu perhatian</h3>
    ${masalah.map(m=>`<div class="alert warn">${m}</div>`).join('')}</div>`:
    `<div class="card"><div class="alert ok">✅ Semua data asas lengkap. Anda boleh terus ke <b>Jana Jadual</b>.</div>
     <button class="btn pri" onclick="go('jana')">✨ Jana Jadual Sekarang</button></div>`}

  <div class="card"><h3>Langkah kerja</h3>
    <div class="grid g3">
      ${[['1️⃣','Tetapan Sekolah','Nama sekolah, tahun, hari, bilangan waktu sehari, masa &amp; rehat.','tetapan'],
         ['2️⃣','Subjek','Kod, nama, warna, sama ada subjek teras / perlu waktu pagi.','subjek'],
         ['3️⃣','Kelas','Nama kelas &amp; tahun (tahap 1–6).','kelas'],
         ['4️⃣','Guru','Nama, kod, had waktu sehari, waktu tidak boleh mengajar.','guru'],
         ['5️⃣','Peruntukan Waktu','Bilangan waktu setiap subjek mengikut <b>tahun</b>.','peruntukan'],
         ['6️⃣','Agihan Guru','Siapa mengajar subjek apa di kelas mana.','agihan'],
         ['7️⃣','Slot Tetap','Perhimpunan, kokurikulum, dan slot yang dikunci.','acara'],
         ['8️⃣','Kekangan','Had berturut, teras waktu pagi, kemudahan terhad.','kekangan'],
         ['9️⃣','Jana &amp; Cetak','Jana automatik, semak, edit, cetak PDF A4 landskap.','jana']
      ].map(([n,t,d,v])=>`<div class="k" style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px">
        <div style="font-size:18px">${n}</div><b style="display:block;margin:2px 0 4px">${t}</b>
        <span class="muted">${d}</span><br><button class="btn sm" style="margin-top:8px" onclick="go('${v}')">Buka →</button></div>`).join('')}
    </div>
  </div>`;
}};

function muatContoh(){
  ask('Muatkan data contoh SK Paya Redan? Data semasa akan diganti.',()=>{
    S=dataContoh(); segerakAgihan(); autoAgihGuru(); simpan();
    toast('Data contoh dimuatkan'); go('dash');
  },'Muatkan');
}

/* ============================================================
   TETAPAN SEKOLAH
   ============================================================ */
VIEWS.tetapan={t:'Tetapan Sekolah & Waktu', r(){
  const jm=jalurMasa();
  const semuaHari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT','SABTU','AHAD'];
  return `
  <div class="card"><h3>Maklumat Sekolah</h3>
    <div class="grid g2">
      <div><label class="f">Nama sekolah</label><input id="tNama" value="${esc(S.sekolah.nama)}" placeholder="SK PAYA REDAN, MUAR"></div>
      <div><label class="f">Tahun</label><input id="tTahun" value="${esc(S.sekolah.tahun)}"></div>
      <div><label class="f">Tarikh mula berkuat kuasa</label><input type="date" id="tBermula" value="${esc(S.sekolah.bermula||'')}"></div>
      <div><label class="f">Tajuk jadual guru</label><input id="tTajukG" value="${esc(S.sekolah.tajukGuru)}"></div>
      <div><label class="f">Tajuk jadual kelas</label><input id="tTajukK" value="${esc(S.sekolah.tajukKelas)}"></div>
      <div><label class="f">Nama Guru Besar</label><input id="tGb" value="${esc(S.sekolah.gb)}"></div>
      <div><label class="f">Gelaran pengesah</label><input id="tGbG" value="${esc(S.sekolah.gbGelaran)}"></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div><label class="f">Logo 1 (kiri)</label>
        <div class="row">${S.sekolah.logo1?`<img src="${S.sekolah.logo1}" class="sh-logo">`:'<span class="muted">Tiada</span>'}
        <button class="btn sm" onclick="pilihLogo(1)">Muat naik</button>
        ${S.sekolah.logo1?`<button class="btn sm dgr" onclick="ubah(()=>S.sekolah.logo1='')||ulang()">Buang</button>`:''}</div></div>
      <div><label class="f">Logo 2 (kanan logo 1)</label>
        <div class="row">${S.sekolah.logo2?`<img src="${S.sekolah.logo2}" class="sh-logo">`:'<span class="muted">Tiada</span>'}
        <button class="btn sm" onclick="pilihLogo(2)">Muat naik</button>
        ${S.sekolah.logo2?`<button class="btn sm dgr" onclick="ubah(()=>S.sekolah.logo2='')||ulang()">Buang</button>`:''}</div></div>
    </div>
  </div>

  <div class="card"><h3>Hari Persekolahan</h3>
    <p class="hint">Pilih hari dan bilangan waktu bagi setiap hari.</p>
    <div class="grid g4">
      ${semuaHari.map(h=>{const on=S.hari.includes(h);return `
        <div style="border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel2)">
          <label class="chk"><input type="checkbox" data-hari="${h}" ${on?'checked':''}> <b>${h}</b></label>
          <label class="f" style="margin-top:6px">Bilangan waktu</label>
          <input type="number" min="0" max="20" data-whari="${h}" value="${num(S.masa.waktu[h],12)}" ${on?'':'disabled'}>
        </div>`;}).join('')}
    </div>
  </div>

  <div class="card"><h3>Waktu &amp; Rehat</h3>
    <div class="grid g4">
      <div><label class="f">Waktu 1 bermula</label><input type="time" id="tMula" value="${esc(S.masa.mula)}"></div>
      <div><label class="f">Tempoh 1 waktu (minit)</label><input type="number" id="tTempoh" min="20" max="90" value="${num(S.masa.tempoh,30)}"></div>
      <div><label class="f">Slot pra-waktu</label>
        <label class="chk"><input type="checkbox" id="tPraOn" ${S.masa.pra.aktif?'checked':''}> Aktifkan</label></div>
      <div><label class="f">Label slot pra-waktu</label><input id="tPraLbl" value="${esc(S.masa.pra.label)}"></div>
      <div><label class="f">Pra-waktu mula</label><input type="time" id="tPraMula" value="${esc(S.masa.pra.mula)}"></div>
      <div><label class="f">Pra-waktu tempoh (minit)</label><input type="number" id="tPraTmp" min="5" max="60" value="${num(S.masa.pra.tempoh,10)}"></div>
    </div>
    <h4 style="margin-top:14px">Rehat</h4>
    <div id="rehatList">${(S.masa.rehat||[]).map((r,i)=>`
      <div class="row" style="margin-bottom:8px">
        <span class="muted">Selepas waktu ke-</span>
        <input type="number" style="width:80px" min="1" max="20" value="${num(r.selepas,5)}" oninput="ubah(()=>S.masa.rehat[${i}].selepas=num(this.value,5))">
        <input type="number" style="width:90px" min="5" max="90" value="${num(r.minit,20)}" oninput="ubah(()=>S.masa.rehat[${i}].minit=num(this.value,20))"><span class="muted">minit</span>
        <input style="width:130px" value="${esc(r.label||'REHAT')}" oninput="ubah(()=>S.masa.rehat[${i}].label=this.value)">
        <button class="btn sm dgr" onclick="ubah(()=>S.masa.rehat.splice(${i},1));ulang()">Buang</button>
      </div>`).join('')||'<p class="muted">Tiada rehat.</p>'}</div>
    <button class="btn sm" onclick="ubah(()=>S.masa.rehat.push({selepas:5,minit:20,label:'REHAT'}));ulang()">+ Tambah rehat</button>
    <h4 style="margin-top:14px">Pratonton jalur masa</h4>
    <div class="tblwrap"><table class="dt"><thead><tr><th>Waktu</th><th>Mula</th><th>Tamat</th></tr></thead><tbody>
      ${S.masa.pra.aktif?`<tr><td><b>${esc(S.masa.pra.label)}</b></td><td>${esc(S.masa.pra.mula)}</td><td>${hm(mm(S.masa.pra.mula)+num(S.masa.pra.tempoh,10))}</td></tr>`:''}
      ${jm.map(x=>{const r=masaRehat(x.p);return `<tr><td><b>${x.p}</b></td><td>${x.mula}</td><td>${x.tamat}</td></tr>`+
        (r?`<tr style="background:var(--panel2)"><td><b>${esc(r.label)}</b></td><td>${r.mula}</td><td>${r.tamat}</td></tr>`:'');}).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" onclick="simpanTetapan()">💾 Simpan Tetapan</button></div>
  </div>`;
}, after(){
  $$('[data-hari]').forEach(cb=>cb.onchange=()=>{
    const h=cb.dataset.hari;
    ubah(()=>{ if(cb.checked){ if(!S.hari.includes(h)) S.hari.push(h);
        S.hari.sort((a,b)=>['ISNIN','SELASA','RABU','KHAMIS','JUMAAT','SABTU','AHAD'].indexOf(a)-['ISNIN','SELASA','RABU','KHAMIS','JUMAAT','SABTU','AHAD'].indexOf(b));
        if(!S.masa.waktu[h]) S.masa.waktu[h]=12; }
      else S.hari=S.hari.filter(x=>x!==h); });
    ulang();
  });
  $$('[data-whari]').forEach(inp=>inp.oninput=()=>ubah(()=>S.masa.waktu[inp.dataset.whari]=num(inp.value,0)));
}};
function simpanTetapan(){
  ubah(()=>{
    S.sekolah.nama=$('#tNama').value; S.sekolah.tahun=$('#tTahun').value; S.sekolah.bermula=$('#tBermula').value;
    S.sekolah.tajukGuru=$('#tTajukG').value; S.sekolah.tajukKelas=$('#tTajukK').value;
    S.sekolah.gb=$('#tGb').value; S.sekolah.gbGelaran=$('#tGbG').value;
    S.masa.mula=$('#tMula').value||'07:30'; S.masa.tempoh=num($('#tTempoh').value,30);
    S.masa.pra={aktif:$('#tPraOn').checked,label:$('#tPraLbl').value,mula:$('#tPraMula').value,tempoh:num($('#tPraTmp').value,10)};
  });
  toast('Tetapan disimpan'); ulang();
}
let logoSlot=1;
function pilihLogo(n){ logoSlot=n; $('#logoIn').click(); }
$('#logoIn').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ ubah(()=>{ S.sekolah['logo'+logoSlot]=r.result; }); toast('Logo dimuat naik'); ulang(); };
  r.readAsDataURL(f); e.target.value='';
};

/* ============================================================
   SUBJEK
   ============================================================ */
VIEWS.subjek={t:'Subjek', r(){
  return `<div class="card"><h3>Senarai Subjek</h3>
    <div class="tblwrap"><table class="dt subject-table"><thead><tr>
      <th style="width:120px">Kod</th><th style="min-width:250px">Nama Subjek</th><th style="width:90px"><button class="th-auto" onclick="autoWarnaSubjek()" title="Tetapkan warna berlainan secara automatik">Warna <span>Auto</span></button></th>
      <th style="width:70px">Teras</th><th style="width:90px">Utama pagi</th>
      <th style="width:125px" title="Benarkan subjek disusun dalam blok dua waktu berturut-turut">2 waktu terus</th><th style="width:145px">Kemudahan</th><th style="width:70px"></th>
    </tr></thead><tbody id="subBody">
    ${S.subjek.map((s,i)=>`<tr>
      <td><input value="${esc(s.kod)}" oninput="ubah(()=>S.subjek[${i}].kod=this.value.toUpperCase())"></td>
      <td><input value="${esc(s.nama)}" oninput="ubah(()=>S.subjek[${i}].nama=this.value)"></td>
      <td><input class="swatch" type="color" value="${esc(s.warna||'#e6e6e6')}" oninput="ubah(()=>S.subjek[${i}].warna=this.value)"></td>
      <td style="text-align:center"><input type="checkbox" ${s.teras?'checked':''} onchange="ubah(()=>S.subjek[${i}].teras=this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" ${s.pagi?'checked':''} onchange="ubah(()=>S.subjek[${i}].pagi=this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" ${s.ganda?'checked':''} onchange="ubah(()=>S.subjek[${i}].ganda=this.checked)" title="Benarkan blok 2 waktu berturut"></td>
      <td><input value="${esc(s.kemudahan||'')}" placeholder="cth. PADANG" oninput="ubah(()=>S.subjek[${i}].kemudahan=this.value.toUpperCase())"></td>
      <td><button class="btn sm dgr" onclick="buangSubjek('${s.id}')">✕</button></td>
    </tr>`).join('')||`<tr><td colspan="8" class="empty">Belum ada subjek. Tekan “Tambah subjek”.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" onclick="tambahSubjek()">+ Tambah subjek</button>
      <button class="btn" onclick="subjekPreset()">📋 Isi set subjek KSSR</button>
    </div>
  </div>`;
}};
function tambahSubjek(){ ubah(()=>S.subjek.push({id:uid(),kod:'',nama:'',warna:PALET[S.subjek.length%PALET.length],teras:false,pagi:false,ganda:false,kemudahan:''})); ulang(); }
function hslKeHex(h,s,l){
  s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(255*x).toString(16).padStart(2,'0')).join('');
}
function autoWarnaSubjek(){
  ubah(()=>S.subjek.forEach((subjek,index)=>subjek.warna=hslKeHex((index*137.508)%360,68,82)));
  ulang();toast('Warna subjek dijana automatik');
}
function buangSubjek(id){ ask('Buang subjek ini beserta peruntukan &amp; agihannya?',()=>{
  ubah(()=>{ S.subjek=S.subjek.filter(s=>s.id!==id); delete S.peruntukan[id];
    S.agihan=S.agihan.filter(a=>a.subjekId!==id);
    if(S.jadual) S.jadual.slots=S.jadual.slots.filter(x=>x.subjekId!==id); });
  ulang(); }); }
function subjekPreset(){
  ask('Tambah set subjek KSSR standard kepada senarai sedia ada?',()=>{
    const set=[['BM','Bahasa Melayu',1,1],['BI','Bahasa Inggeris',1,1],['MATE','Matematik',1,1],['SN','Sains',1,1],
      ['PI','Pendidikan Islam',1,0],['PMORAL','Pendidikan Moral',1,0],['SEJ','Sejarah',0,0],
      ['RBT','Reka Bentuk & Teknologi',0,0],['PSV','Pendidikan Seni Visual',0,0],['PM','Pendidikan Muzik',0,0],
      ['PJ','Pendidikan Jasmani',0,0],['PK','Pendidikan Kesihatan',0,0]];
    ubah(()=>{ set.forEach(([kod,nama,teras,pagi],i)=>{
      if(S.subjek.some(s=>s.kod===kod)) return;
      S.subjek.push({id:uid(),kod,nama,warna:PALET[(S.subjek.length)%PALET.length],teras:!!teras,pagi:!!pagi,
        ganda:['RBT','PSV'].includes(kod),kemudahan:kod==='PJ'?'PADANG':''});
    });});
    ulang(); toast('Set subjek ditambah');
  },'Tambah',false);
}

/* ============================================================
   KELAS
   ============================================================ */
VIEWS.kelas={t:'Kelas', r(){
  return `<div class="card"><h3>Senarai Kelas</h3>
    <p class="hint">“Tahun” menentukan peruntukan waktu yang digunakan bagi kelas tersebut.</p>
    <div class="tblwrap"><table class="dt"><thead><tr>
      <th>Nama Kelas</th><th style="width:110px">Tahun</th><th style="width:240px">Guru Kelas</th>
      <th style="width:110px">Jumlah waktu</th><th style="width:70px"></th></tr></thead><tbody>
    ${S.kelas.map((k,i)=>{
      const jum=S.subjek.reduce((s,sb)=>s+waktuDiperuntuk(k.id,sb.id),0);
      const kap=S.hari.reduce((s,h)=>s+waktuHari(h),0);
      return `<tr>
      <td><input value="${esc(k.nama)}" oninput="ubah(()=>S.kelas[${i}].nama=this.value)"></td>
      <td><select onchange="ubah(()=>S.kelas[${i}].tahap=num(this.value,1));ulang()">
        ${[1,2,3,4,5,6].map(t=>`<option value="${t}" ${k.tahap===t?'selected':''}>Tahun ${t}</option>`).join('')}</select></td>
      <td><select onchange="ubah(()=>S.kelas[${i}].guruKelas=this.value)">
        <option value="">— Tiada —</option>
        ${S.guru.map(g=>`<option value="${g.id}" ${k.guruKelas===g.id?'selected':''}>${esc(g.nama)}</option>`).join('')}</select></td>
      <td><span class="pill ${jum>kap?'bad':jum===kap?'ok':''}">${jum} / ${kap}</span></td>
      <td><button class="btn sm dgr" onclick="buangKelas('${k.id}')">✕</button></td></tr>`;}).join('')
      ||`<tr><td colspan="5" class="empty">Belum ada kelas.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" onclick="tambahKelas()">+ Tambah kelas</button>
      <button class="btn" onclick="janaKelasPukal()">⚡ Jana pukal (Tahun 1–6)</button>
    </div></div>`;
}};
function tambahKelas(){ ubah(()=>S.kelas.push({id:uid(),nama:'',tahap:1,guruKelas:''})); ulang(); }
function buangKelas(id){ ask('Buang kelas ini?',()=>{ ubah(()=>{ S.kelas=S.kelas.filter(k=>k.id!==id);
  S.agihan=S.agihan.filter(a=>a.kelasId!==id);
  if(S.jadual) S.jadual.slots=S.jadual.slots.filter(x=>x.kelasId!==id); }); ulang(); }); }
function janaKelasPukal(){
  $('#dlgBody').innerHTML=`<h3>Jana kelas pukal</h3>
    <p class="hint">Contoh nama cawangan: <code>Bijak, Cerdik, Pintar</code></p>
    <label class="f">Nama cawangan (dipisah koma)</label><input id="jkCab" value="Bijak">
    <label class="f" style="margin-top:8px">Tahun terlibat</label>
    <div class="row">${[1,2,3,4,5,6].map(t=>`<label class="chk"><input type="checkbox" class="jkT" value="${t}" checked> ${t}</label>`).join('')}</div>
    <label class="f" style="margin-top:8px">Format nama</label>
    <select id="jkFmt"><option value="T C">Tahun + Cawangan (cth. 4 Bijak)</option>
      <option value="C T">Cawangan + Tahun (cth. Bijak 4)</option></select>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doJanaKelas()">Jana</button></div>`;
  $('#dlg').showModal();
}
function doJanaKelas(){
  const cab=$('#jkCab').value.split(',').map(x=>x.trim()).filter(Boolean);
  const tah=$$('.jkT').filter(c=>c.checked).map(c=>num(c.value));
  const fmt=$('#jkFmt').value;
  ubah(()=>{ tah.forEach(t=>cab.forEach(c=>{
    const nama = fmt==='T C' ? `${t} ${c}` : `${c} ${t}`;
    if(!S.kelas.some(k=>k.nama===nama)) S.kelas.push({id:uid(),nama,tahap:t,guruKelas:''});
  })); });
  $('#dlg').close(); ulang(); toast('Kelas dijana');
}

/* ============================================================
   GURU
   ============================================================ */
VIEWS.guru={t:'Guru', r(){
  const st=stat();
  return `<div class="card"><h3>Senarai Guru</h3>
    <div class="tblwrap"><table class="dt teacher-table"><thead><tr>
      <th style="min-width:340px">Nama / jawatan</th><th style="width:135px">Kod</th>
      <th style="width:110px">Maks/hari</th><th style="width:120px">Beban</th>
      <th style="width:150px">Tidak tersedia</th><th style="width:60px"></th></tr></thead><tbody>
    ${S.guru.map((g,i)=>`<tr>
      <td><input aria-label="Nama guru" value="${esc(g.nama)}" oninput="ubah(()=>S.guru[${i}].nama=this.value)">${g.jawatan?`<small class="teacher-position">${esc(g.jawatan)}</small>`:''}</td>
      <td><input value="${esc(g.kod||'')}" oninput="ubah(()=>S.guru[${i}].kod=this.value)"></td>
      <td><input type="number" min="1" max="20" value="${num(g.maxHari,8)}" oninput="ubah(()=>S.guru[${i}].maxHari=num(this.value,8))"></td>
      <td><span class="pill ${(st.bebanGuru[g.id]||0)>34?'warn':''}">${st.bebanGuru[g.id]||0} wkt</span></td>
      <td><button class="btn sm" onclick="editTidakAda('${g.id}')">${(g.tidakAda||[]).length} slot ▸</button></td>
      <td><button class="btn sm dgr" onclick="buangGuru('${g.id}')">✕</button></td></tr>`).join('')
      ||`<tr><td colspan="6" class="empty">Belum ada guru.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" onclick="tambahGuru()">+ Tambah guru</button>
      <button class="btn" onclick="importGuruPukal()">📋 Tampal senarai nama</button>
    </div></div>`;
}};
function tambahGuru(){ ubah(()=>S.guru.push({id:uid(),nama:'',kod:'',maxHari:8,tidakAda:[]})); ulang(); }
function buangGuru(id){ ask('Buang guru ini? Agihan subjeknya akan dikosongkan.',()=>{
  ubah(()=>{ S.guru=S.guru.filter(g=>g.id!==id);
    S.agihan.forEach(a=>{ if(a.guruId===id) a.guruId=''; a.pairGuruIds=(a.pairGuruIds||[]).filter(gid=>gid!==id); });
    S.kelas.forEach(k=>{ if(k.guruKelas===id) k.guruKelas=''; });
    if(S.jadual) S.jadual.slots=S.jadual.slots.filter(x=>x.guruId!==id); });
  ulang(); }); }
function importGuruPukal(){
  $('#dlgBody').innerHTML=`<h3>Tampal senarai nama guru</h3>
    <p class="hint">Satu nama satu baris. Kod ringkas boleh ditambah selepas tanda |.</p>
    <textarea id="gpTxt" style="min-height:180px" placeholder="MOHAMAD AZIZI BIN BASRI|AZIZI&#10;NORHAYATI BINTI OSMAN|NORHA"></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doImportGuru()">Tambah</button></div>`;
  $('#dlg').showModal();
}
function doImportGuru(){
  const baris=$('#gpTxt').value.split('\n').map(x=>x.trim()).filter(Boolean);
  ubah(()=>baris.forEach(b=>{
    const p=b.split('|').map(x=>x.trim());
    const gelaranLama=/^(EN|PN|CIK|TN HJ|PN HJH|DR)$/i.test(p[0]);
    const nama=gelaranLama?p[1]:p[0],kod=gelaranLama?(p[2]||''):(p[1]||'');
    if(nama) S.guru.push({id:uid(),nama:nama.toUpperCase(),kod,maxHari:8,tidakAda:[]});
  }));
  $('#dlg').close(); ulang(); toast(baris.length+' guru ditambah');
}
function editTidakAda(id){
  const g=guruById(id); const set=new Set(g.tidakAda||[]);
  const N=maxWaktu();
  $('#dlgBody').innerHTML=`<h3>Waktu tidak tersedia — ${esc(g.nama)}</h3>
    <p class="hint">Klik slot untuk menandakan guru <b>tidak boleh</b> mengajar.</p>
    <div class="ttwrap"><table class="tt" style="min-width:auto"><thead><tr><th class="day"></th>
      ${Array.from({length:N},(_,i)=>`<th class="pnum">${i+1}</th>`).join('')}</tr></thead><tbody>
      ${S.hari.map(h=>`<tr><td class="day">${HARI_PENDEK[h]||h.slice(0,3)}</td>
        ${Array.from({length:N},(_,i)=>{const p=i+1;const k=h+'-'+p;
          const off=p>waktuHari(h);
          return `<td class="pick ${set.has(k)?'has':''}" style="height:34px;${off?'opacity:.3;pointer-events:none':''}"
            data-k="${k}">${set.has(k)?'✕':''}</td>`;}).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <button class="btn sm" id="taKosong">Kosongkan semua</button>
      <span><button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" id="taSimpan">Simpan</button></span></div>`;
  const d=$('#dlg'); d.showModal();
  $$('#dlgBody td.pick').forEach(td=>td.onclick=()=>{
    const k=td.dataset.k;
    if(set.has(k)){set.delete(k);td.classList.remove('has');td.textContent='';}
    else{set.add(k);td.classList.add('has');td.textContent='✕';}
  });
  $('#taKosong').onclick=()=>{ set.clear(); $$('#dlgBody td.pick').forEach(td=>{td.classList.remove('has');td.textContent='';}); };
  $('#taSimpan').onclick=()=>{ ubah(()=>g.tidakAda=Array.from(set)); d.close(); ulang(); };
}


/* ============================================================
   PERUNTUKAN WAKTU (ikut tahun)
   ============================================================ */
VIEWS.peruntukan={t:'Peruntukan Waktu Mengikut Tahun', r(){
  const tahapAda=[...new Set(S.kelas.map(k=>k.tahap))].sort((a,b)=>a-b);
  const tahap=tahapAda.length?tahapAda:[1,2,3,4,5,6];
  const kap=S.hari.reduce((s,h)=>s+waktuHari(h),0);
  const acaraSemua=(S.acara||[]).filter(a=>a.skop!=='guru').reduce((s,a)=>s+num(a.panjang,1),0);
  const jumTahap={}; tahap.forEach(t=>jumTahap[t]=S.subjek.reduce((s,sb)=>s+num((S.peruntukan[sb.id]||{})[t],0),0));
  return `<div class="card"><h3>Bilangan waktu seminggu bagi setiap subjek</h3>
    <p class="hint">Isi bilangan waktu untuk setiap subjek mengikut tahun. Semua kelas dalam tahun yang sama akan mengikut peruntukan ini (boleh diubah untuk kelas tertentu di <b>Agihan Guru</b>).</p>
    ${S.subjek.length?'':'<div class="alert warn">Tambah subjek dahulu.</div>'}
    <div class="tblwrap"><table class="dt"><thead><tr><th style="min-width:190px">Subjek</th>
      ${tahap.map(t=>`<th style="width:90px;text-align:center">Tahun ${t}</th>`).join('')}
      <th style="width:80px;text-align:center">Jumlah</th></tr></thead><tbody>
    ${S.subjek.map(sb=>{
      const p=S.peruntukan[sb.id]||{};
      const jum=tahap.reduce((s,t)=>s+num(p[t],0),0);
      return `<tr><td><span class="tag" style="background:${esc(sb.warna)};color:#000">${esc(sb.kod)}</span> ${esc(sb.nama)}</td>
        ${tahap.map(t=>`<td style="text-align:center"><input type="number" min="0" max="30" style="text-align:center"
          value="${num(p[t],0)||''}" placeholder="0"
          oninput="setPeruntukan('${sb.id}',${t},this.value)"></td>`).join('')}
        <td style="text-align:center"><b>${jum}</b></td></tr>`;}).join('')
      ||`<tr><td colspan="${tahap.length+2}" class="empty">Tiada subjek.</td></tr>`}
    </tbody>
    <tfoot><tr style="background:var(--panel2);font-weight:700">
      <td>Jumlah / kapasiti seminggu</td>
      ${tahap.map(t=>{const j=jumTahap[t], baki=kap-acaraSemua-j;
        return `<td style="text-align:center"><span class="pill ${baki<0?'bad':baki===0?'ok':''}">${j} / ${kap-acaraSemua}</span></td>`;}).join('')}
      <td></td></tr></tfoot></table></div>
    <p class="scrollhint">Kapasiti = jumlah waktu seminggu (${kap}) tolak slot tetap seluruh sekolah (${acaraSemua}).</p>
    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="salinTahap()">↔️ Salin lajur tahun</button>
      <button class="btn" onclick="ubah(()=>{segerakAgihan()});ulang();toast('Agihan diselaraskan')">🔄 Selaraskan agihan</button>
    </div></div>`;
}};
function setPeruntukan(sid,tahap,val){
  ubah(()=>{ S.peruntukan[sid]=S.peruntukan[sid]||{}; const v=num(val,0);
    if(v>0) S.peruntukan[sid][tahap]=v; else delete S.peruntukan[sid][tahap]; segerakAgihan(); });
}
function salinTahap(){
  const tahapAda=[...new Set(S.kelas.map(k=>k.tahap))].sort((a,b)=>a-b);
  const t=tahapAda.length?tahapAda:[1,2,3,4,5,6];
  $('#dlgBody').innerHTML=`<h3>Salin lajur tahun</h3>
    <div class="grid g2"><div><label class="f">Dari</label><select id="cpFrom">${t.map(x=>`<option value="${x}">Tahun ${x}</option>`).join('')}</select></div>
    <div><label class="f">Ke</label><div>${t.map(x=>`<label class="chk"><input type="checkbox" class="cpTo" value="${x}"> Tahun ${x}</label>`).join('')}</div></div></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doSalinTahap()">Salin</button></div>`;
  $('#dlg').showModal();
}
function doSalinTahap(){
  const from=num($('#cpFrom').value), to=$$('.cpTo').filter(c=>c.checked).map(c=>num(c.value));
  ubah(()=>{ S.subjek.forEach(sb=>{ const p=S.peruntukan[sb.id]||{}; const v=num(p[from],0);
    to.forEach(t=>{ if(v>0){S.peruntukan[sb.id]=p; p[t]=v;} else delete p[t]; }); }); segerakAgihan(); });
  $('#dlg').close(); ulang(); toast('Disalin');
}

/* ============================================================
   AGIHAN GURU
   ============================================================ */
let agihanKelas=null, agihanMod='kelas';
VIEWS.agihan={t:'Agihan Guru', r(){
  segerakAgihan();
  if(!S.kelas.length) return `<div class="card"><div class="alert warn">Tambah kelas dahulu.</div></div>`;
  if(!agihanKelas||!kelasById(agihanKelas)) agihanKelas=S.kelas[0].id;
  const st=stat();
  return `<div class="card"><div class="row">
      <div class="seg">
        <button class="${agihanMod==='kelas'?'on':''}" onclick="agihanMod='kelas';ulang()">Ikut Kelas</button>
        <button class="${agihanMod==='guru'?'on':''}" onclick="agihanMod='guru';ulang()">Ikut Guru</button>
      </div>
      <div class="right row">
        <button class="btn" onclick="ask('Agih guru secara automatik untuk slot yang masih kosong?',()=>{ubah(()=>autoAgihGuru());ulang();toast('Agihan automatik selesai')},'Agih',false)">⚡ Auto agih</button>
        <button class="btn dgr" onclick="ask('Kosongkan semua agihan guru dan pairing?',()=>{ubah(()=>S.agihan.forEach(a=>{a.guruId='';a.pairGuruIds=[]}));ulang()})">Kosongkan</button>
      </div></div>
    ${st.tanpaGuru?`<div class="alert warn" style="margin-top:12px"><b>${st.tanpaGuru} waktu</b> masih tanpa guru.</div>`:
      `<div class="alert ok" style="margin-top:12px">✅ Semua waktu sudah ada guru.</div>`}
  </div>
  ${agihanMod==='kelas'?agihanIkutKelas():agihanIkutGuru()}`;
}};
function agihanIkutKelas(){
  const k=kelasById(agihanKelas);
  const rows=S.agihan.filter(a=>a.kelasId===agihanKelas);
  const jum=rows.reduce((s,a)=>s+waktuEfektif(a),0);
  const kap=S.hari.reduce((s,h)=>s+waktuHari(h),0);
  const acaraSemua=(S.acara||[]).filter(a=>a.skop!=='guru'&&(a.skop==='semua'||(a.kelas||[]).includes(agihanKelas)))
    .reduce((s,a)=>s+num(a.panjang,1),0);
  return `<div class="card">
    <div class="row"><div style="flex:1;max-width:320px"><label class="f">Kelas</label>
      <select onchange="agihanKelas=this.value;ulang()">
        ${S.kelas.map(x=>`<option value="${x.id}" ${x.id===agihanKelas?'selected':''}>${esc(x.nama)} (Tahun ${x.tahap})</option>`).join('')}</select></div>
      <div style="align-self:flex-end"><span class="pill ${jum+acaraSemua>kap?'bad':''}">${jum} waktu + ${acaraSemua} slot tetap / ${kap}</span></div></div>
    <div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr>
      <th style="min-width:170px">Subjek</th><th style="width:100px">Waktu</th>
      <th style="width:130px">Bil. blok 2 waktu</th><th style="min-width:200px">Guru utama</th><th style="min-width:170px">Kelas pairing</th></tr></thead><tbody>
    ${rows.map(a=>{ const sb=subjekById(a.subjekId); if(!sb) return '';
      const i=S.agihan.indexOf(a);
      const asas=waktuDiperuntuk(a.kelasId,a.subjekId);
      return `<tr>
      <td><span class="tag" style="background:${esc(sb.warna)};color:#000">${esc(sb.kod)}</span> ${esc(sb.nama)}</td>
      <td><input type="number" min="0" max="30" style="text-align:center" value="${waktuEfektif(a)}"
        title="Asas tahun: ${asas}" oninput="ubah(()=>S.agihan[${i}].waktu=this.value===''?'':num(this.value,0))"></td>
      <td><input type="number" min="0" max="6" style="text-align:center" value="${num(a.ganda,0)}"
        ${sb.ganda?'':'disabled title="Aktifkan “2 waktu terus” pada subjek"'} oninput="ubah(()=>S.agihan[${i}].ganda=num(this.value,0))"></td>
      <td><select onchange="ubah(()=>{S.agihan[${i}].guruId=this.value;S.agihan[${i}].pairGuruIds=(S.agihan[${i}].pairGuruIds||[]).filter(id=>id!==this.value)});ulang()" style="${a.guruId?'':'border-color:var(--bad)'}">
        <option value="">— pilih guru —</option>
        ${S.guru.map(g=>`<option value="${g.id}" ${a.guruId===g.id?'selected':''}>${esc(g.nama)}</option>`).join('')}</select></td>
      <td><button class="btn sm" ${a.guruId?'':'disabled title="Pilih guru utama dahulu"'} onclick="pilihGuruPairing(${i})">
        ${(a.pairGuruIds||[]).length?`${(a.pairGuruIds||[]).length} guru pasangan`:'Tetapkan pairing'}</button></td></tr>`;}).join('')
      ||`<tr><td colspan="5" class="empty">Tiada peruntukan waktu untuk Tahun ${k?k.tahap:''}. Isi di <b>Peruntukan Waktu</b>.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="samaGuruSemua()">👤 Tetapkan seorang guru untuk semua subjek kelas ini</button>
    </div></div>`;
}
function samaGuruSemua(){
  $('#dlgBody').innerHTML=`<h3>Tetapkan guru</h3><label class="f">Guru</label>
    <select id="sgG">${S.guru.map(g=>`<option value="${g.id}">${esc(g.nama)}</option>`).join('')}</select>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="sgKosong" checked> Hanya yang belum ada guru</label>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doSamaGuru()">Tetapkan</button></div>`;
  $('#dlg').showModal();
}
function doSamaGuru(){
  const gid=$('#sgG').value, hanya=$('#sgKosong').checked;
  ubah(()=>S.agihan.filter(a=>a.kelasId===agihanKelas).forEach(a=>{ if(!hanya||!a.guruId){a.guruId=gid;a.pairGuruIds=(a.pairGuruIds||[]).filter(id=>id!==gid);} }));
  $('#dlg').close(); ulang();
}
function pilihGuruPairing(index){
  const a=S.agihan[index];if(!a||!a.guruId) return;
  const cur=new Set(a.pairGuruIds||[]);
  $('#dlgBody').innerHTML=`<h3>Kelas pairing</h3>
    <p class="hint"><b>${esc(namaKelas(a.kelasId))} · ${esc(kodSubjek(a.subjekId))}</b><br>Guru yang dipilih akan dijadualkan bersama guru utama pada kelas dan waktu yang sama.</p>
    <div style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px">
      ${S.guru.filter(g=>g.id!==a.guruId).map(g=>`<label class="chk"><input type="checkbox" class="pairGuru" value="${g.id}" ${cur.has(g.id)?'checked':''}> ${esc(g.nama)}</label>`).join('')||'<p class="muted">Tiada guru lain.</p>'}
    </div>
    <div class="row" style="justify-content:space-between;margin-top:12px"><button class="btn dgr" onclick="$$('.pairGuru').forEach(x=>x.checked=false)">Kosongkan</button><span><button class="btn" onclick="dlg.close()">Batal</button> <button class="btn pri" onclick="simpanGuruPairing(${index})">Simpan pairing</button></span></div>`;
  $('#dlg').showModal();
}
function simpanGuruPairing(index){
  ubah(()=>S.agihan[index].pairGuruIds=$$('.pairGuru').filter(input=>input.checked).map(input=>input.value));
  $('#dlg').close();ulang();toast((S.agihan[index].pairGuruIds||[]).length?'Pairing disimpan':'Pairing dikosongkan');
}
function agihanIkutGuru(){
  const st=stat();
  return `<div class="card"><h3>Beban Mengajar Guru</h3>
    <div class="tblwrap"><table class="dt"><thead><tr><th>Guru</th><th style="width:90px">Waktu</th><th>Tugasan</th></tr></thead><tbody>
    ${S.guru.map(g=>{
      const t=S.agihan.filter(a=>(a.guruId===g.id||(a.pairGuruIds||[]).includes(g.id))&&waktuEfektif(a)>0);
      return `<tr><td><b>${esc(g.nama)}</b></td>
        <td><span class="pill ${(st.bebanGuru[g.id]||0)>34?'warn':(st.bebanGuru[g.id]||0)===0?'bad':'ok'}">${st.bebanGuru[g.id]||0}</span></td>
        <td>${t.map(a=>`<span class="tag" style="background:${esc(warnaSubjek(a.subjekId))};color:#000;margin:1px 2px;display:inline-block">${esc(kodSubjek(a.subjekId))} ${esc(namaKelas(a.kelasId))} · ${waktuEfektif(a)}${(a.pairGuruIds||[]).includes(g.id)?' · pairing':''}</span>`).join('')||'<span class="muted">Tiada</span>'}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    ${(()=>{const kosong=S.agihan.filter(a=>!a.guruId&&waktuEfektif(a)>0);
      return kosong.length?`<h4 style="margin-top:14px">Belum ada guru (${kosong.length})</h4>
      <div class="tblwrap"><table class="dt"><thead><tr><th>Kelas</th><th>Subjek</th><th style="width:80px">Waktu</th><th style="min-width:200px">Guru</th></tr></thead><tbody>
      ${kosong.map(a=>{const i=S.agihan.indexOf(a);return `<tr><td>${esc(namaKelas(a.kelasId))}</td><td>${esc(kodSubjek(a.subjekId))}</td><td>${waktuEfektif(a)}</td>
        <td><select onchange="ubah(()=>S.agihan[${i}].guruId=this.value);ulang()"><option value="">— pilih —</option>
        ${S.guru.map(g=>`<option value="${g.id}">${esc(g.nama)}</option>`).join('')}</select></td></tr>`;}).join('')}
      </tbody></table></div>`:'';})()}
  </div>`;
}

/* ============================================================
   SLOT TETAP / ACARA
   ============================================================ */
VIEWS.acara={t:'Slot Tetap', r(){
  const N=maxWaktu();
  return `<div class="card"><h3>Slot Tetap &amp; Aktiviti Terkunci</h3>
    <p class="hint">Slot yang dikunci pada hari &amp; waktu tertentu — perhimpunan, kokurikulum, bacaan Al-Quran, mesyuarat panitia. Slot ini akan disekat daripada digunakan oleh mata pelajaran.</p>
    <div class="tblwrap"><table class="dt"><thead><tr>
      <th style="width:90px">Kod</th><th>Nama</th><th style="width:110px">Hari</th>
      <th style="width:90px">Waktu</th><th style="width:90px">Panjang</th>
      <th style="width:150px">Skop</th><th style="width:60px">Warna</th><th style="width:60px"></th></tr></thead><tbody>
    ${(S.acara||[]).map((a,i)=>`<tr>
      <td><input value="${esc(a.kod)}" oninput="ubah(()=>S.acara[${i}].kod=this.value.toUpperCase())"></td>
      <td><input value="${esc(a.nama)}" oninput="ubah(()=>S.acara[${i}].nama=this.value)"></td>
      <td><select onchange="ubah(()=>S.acara[${i}].hari=this.value)">${S.hari.map(h=>`<option ${a.hari===h?'selected':''}>${h}</option>`).join('')}</select></td>
      <td><input type="number" min="1" max="${N}" value="${num(a.mula,1)}" oninput="ubah(()=>S.acara[${i}].mula=num(this.value,1))"></td>
      <td><input type="number" min="1" max="8" value="${num(a.panjang,1)}" oninput="ubah(()=>S.acara[${i}].panjang=num(this.value,1))"></td>
      <td><select onchange="ubah(()=>S.acara[${i}].skop=this.value);ulang()">
        <option value="semua" ${a.skop==='semua'?'selected':''}>Seluruh sekolah</option>
        <option value="kelas" ${a.skop==='kelas'?'selected':''}>Kelas terpilih…</option>
        <option value="guru" ${a.skop==='guru'?'selected':''}>Guru terpilih…</option></select>
        ${a.skop==='kelas'?`<button class="btn sm" style="margin-top:4px" onclick="pilihSenarai(${i},'kelas')">${(a.kelas||[]).length} kelas ▸</button>`:''}
        ${a.skop==='guru'?`<button class="btn sm" style="margin-top:4px" onclick="pilihSenarai(${i},'guru')">${(a.guru||[]).length} guru ▸</button>`:''}</td>
      <td><input class="swatch" type="color" value="${esc(a.warna||'#e6e6e6')}" oninput="ubah(()=>S.acara[${i}].warna=this.value)"></td>
      <td><button class="btn sm dgr" onclick="ubah(()=>S.acara.splice(${i},1));ulang()">✕</button></td></tr>`).join('')
      ||`<tr><td colspan="8" class="empty">Tiada slot tetap.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" onclick="ubah(()=>S.acara.push({id:uid(),nama:'Aktiviti',kod:'AKT',warna:'#e6e6e6',hari:S.hari[0],mula:1,panjang:1,skop:'semua',guru:[],kelas:[]}));ulang()">+ Tambah slot tetap</button>
    </div></div>`;
}};
function pilihSenarai(i,jenis){
  const a=S.acara[i]; const senarai = jenis==='kelas'?S.kelas:S.guru;
  const cur=new Set(a[jenis]||[]);
  $('#dlgBody').innerHTML=`<h3>Pilih ${jenis==='kelas'?'kelas':'guru'} — ${esc(a.nama)}</h3>
    <div style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px">
    ${senarai.map(x=>`<label class="chk"><input type="checkbox" class="psX" value="${x.id}" ${cur.has(x.id)?'checked':''}> ${esc(x.nama)}</label>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doPilihSenarai(${i},'${jenis}')">Simpan</button></div>`;
  $('#dlg').showModal();
}
function doPilihSenarai(i,jenis){
  ubah(()=>S.acara[i][jenis]=$$('.psX').filter(c=>c.checked).map(c=>c.value));
  $('#dlg').close(); ulang();
}

/* ============================================================
   KEKANGAN
   ============================================================ */
VIEWS.kekangan={t:'Kekangan Penjanaan', r(){
  const K=S.kekangan;
  const kem=[...new Set(S.subjek.map(s=>s.kemudahan).filter(Boolean))];
  return `<div class="card"><h3>Kekangan Keras</h3>
    <p class="hint">Peraturan yang <b>mesti</b> dipatuhi. Jika terlalu ketat, jadual mungkin gagal dijana sepenuhnya.</p>
    <div class="grid g3">
      <div><label class="f">Maksimum waktu mengajar seorang guru sehari</label>
        <input type="number" min="1" max="14" value="${num(K.maxHariGuru,8)}" oninput="ubah(()=>S.kekangan.maxHariGuru=num(this.value,8))"></div>
      <div><label class="f">Maksimum waktu berturut-turut seorang guru</label>
        <input type="number" min="1" max="10" value="${num(K.maxBerturut,4)}" oninput="ubah(()=>S.kekangan.maxBerturut=num(this.value,4))"></div>
      <div><label class="f">Maksimum waktu satu subjek dalam sehari (bagi satu kelas)</label>
        <input type="number" min="1" max="6" value="${num(K.maxSubjekSehari,2)}" oninput="ubah(()=>S.kekangan.maxSubjekSehari=num(this.value,2))"></div>
    </div>
    ${kem.length?`<h4 style="margin-top:14px">Had kemudahan serentak</h4>
      <p class="hint">Berapa kelas boleh menggunakan kemudahan ini pada waktu yang sama (cth. PADANG = 2).</p>
      <div class="grid g4">${kem.map(k=>`<div><label class="f">${esc(k)}</label>
        <input type="number" min="1" max="20" value="${num((K.kapasiti||{})[k],2)}"
          oninput="ubah(()=>{S.kekangan.kapasiti=S.kekangan.kapasiti||{};S.kekangan.kapasiti['${esc(k)}']=num(this.value,2)})"></div>`).join('')}</div>`:''}
  </div>

  <div class="card"><h3>Kekangan Lembut (keutamaan)</h3>
    <p class="hint">Sistem akan cuba mematuhi, tetapi tidak akan gagal jika tidak tercapai.</p>
    <label class="chk"><input type="checkbox" ${K.terasPagi?'checked':''} onchange="ubah(()=>S.kekangan.terasPagi=this.checked)">
      Letakkan subjek teras / bertanda “utama pagi” pada waktu sebelum rehat</label>
    <label class="chk"><input type="checkbox" ${K.elakAkhirTeras?'checked':''} onchange="ubah(()=>S.kekangan.elakAkhirTeras=this.checked)">
      Elakkan subjek teras pada waktu terakhir hari</label>
    <label class="chk"><input type="checkbox" ${K.sebarHari?'checked':''} onchange="ubah(()=>S.kekangan.sebarHari=this.checked)">
      Sebarkan subjek merentas hari (elak berhimpun pada satu hari)</label>
    <label class="chk"><input type="checkbox" ${K.elakLubang?'checked':''} onchange="ubah(()=>S.kekangan.elakLubang=this.checked)">
      Kurangkan waktu kosong di tengah jadual guru</label>
    <div style="max-width:320px;margin-top:12px"><label class="f">Bilangan percubaan penjanaan (lebih tinggi = lebih baik, lebih lambat)</label>
      <input type="number" min="5" max="400" value="${num(K.cubaan,60)}" oninput="ubah(()=>S.kekangan.cubaan=num(this.value,60))"></div>
  </div>`;
}};


/* ============================================================
   ENJIN PENJANAAN JADUAL
   Greedy berpandu + pembaikan min-conflicts + pendakian bukit
   ============================================================ */

function rehatSet(){ return new Set((S.masa.rehat||[]).map(r=>num(r.selepas))); }

function binaKonteks(){
  const hari=S.hari, D=hari.length, N=Math.max(1,maxWaktu());
  const kelas=S.kelas, guru=S.guru, subjek=S.subjek;
  const ki={},gi={},si={};
  kelas.forEach((k,i)=>ki[k.id]=i); guru.forEach((g,i)=>gi[g.id]=i); subjek.forEach((s,i)=>si[s.id]=i);
  const cn=D*N;
  const C={hari,D,N,cn,kelas,guru,subjek,ki,gi,si,
    dayLen:hari.map(h=>Math.min(waktuHari(h),N)),
    brk:rehatSet(),
    kelasBusy:kelas.map(()=>new Int32Array(cn).fill(-1)),
    guruBusy:guru.map(()=>new Int32Array(cn).fill(-1)),
    kelasBlok:kelas.map(()=>new Uint8Array(cn)),
    guruBlok:guru.map(()=>new Uint8Array(cn)),
    subDay:kelas.map(()=>new Int16Array(D*Math.max(1,subjek.length))),
    ideal:kelas.map(()=>new Int16Array(Math.max(1,subjek.length)).fill(1)),
    guruDay:guru.map(()=>new Int16Array(D)),
    kem:{}, kemMax:{},
    maxHariGuru:num(S.kekangan.maxHariGuru,8),
    maxBerturut:num(S.kekangan.maxBerturut,4),
    maxSubjekSehari:num(S.kekangan.maxSubjekSehari,2)
  };
  // bilangan waktu ideal sehari bagi setiap kelas×subjek (untuk penyebaran)
  S.agihan.forEach(a=>{ if(ki[a.kelasId]==null||si[a.subjekId]==null) return;
    const w=waktuEfektif(a); if(w>0) C.ideal[ki[a.kelasId]][si[a.subjekId]]=Math.max(1,Math.ceil(w/D)); });
  // kemudahan
  [...new Set(subjek.map(s=>s.kemudahan).filter(Boolean))].forEach(k=>{
    C.kem[k]=new Int16Array(cn); C.kemMax[k]=num((S.kekangan.kapasiti||{})[k],2);
  });
  // sekat waktu di luar bilangan waktu hari
  for(let d=0;d<D;d++) for(let p=C.dayLen[d]+1;p<=N;p++){
    const c=d*N+p-1; kelas.forEach((_,i)=>C.kelasBlok[i][c]=1); guru.forEach((_,i)=>C.guruBlok[i][c]=1);
  }
  // guru tidak tersedia
  guru.forEach((g,i)=>(g.tidakAda||[]).forEach(k=>{
    const [h,p]=k.split('-'); const d=hari.indexOf(h); const pp=num(p);
    if(d>=0&&pp>=1&&pp<=N) C.guruBlok[i][d*N+pp-1]=1;
  }));
  // slot tetap
  (S.acara||[]).forEach(a=>{
    const d=hari.indexOf(a.hari); if(d<0) return;
    for(let o=0;o<num(a.panjang,1);o++){
      const p=num(a.mula,1)+o; if(p<1||p>N) continue; const c=d*N+p-1;
      if(a.skop==='semua'){ kelas.forEach((_,i)=>C.kelasBlok[i][c]=1); guru.forEach((_,i)=>C.guruBlok[i][c]=1); }
      else if(a.skop==='kelas'){ (a.kelas||[]).forEach(id=>{ if(ki[id]!=null) C.kelasBlok[ki[id]][c]=1; }); }
      else if(a.skop==='guru'){ (a.guru||[]).forEach(id=>{ if(gi[id]!=null) C.guruBlok[gi[id]][c]=1; }); }
    }
  });
  return C;
}
function resetKonteks(C){
  C.kelasBusy.forEach(a=>a.fill(-1)); C.guruBusy.forEach(a=>a.fill(-1));
  C.subDay.forEach(a=>a.fill(0)); C.guruDay.forEach(a=>a.fill(0));
  Object.keys(C.kem).forEach(k=>C.kem[k].fill(0));
}

/* ---------- Unit pengajaran ---------- */
function binaUnit(C){
  segerakAgihan();
  const units=[], tiadaGuru=[];
  S.agihan.forEach(a=>{
    const w=waktuEfektif(a); if(w<=0) return;
    const sb=subjekById(a.subjekId), kl=kelasById(a.kelasId);
    if(!sb||!kl) return;
    if(!a.guruId||C.gi[a.guruId]==null){ tiadaGuru.push({kelas:kl.nama,subjek:sb.kod,waktu:w}); return; }
    let ganda=Math.min(num(a.ganda,0),Math.floor(w/2));
    if(!sb.ganda) ganda=0;
    const sisa=w-ganda*2;
    const pairGuruIds=[...new Set(a.pairGuruIds||[])].filter(id=>id!==a.guruId&&C.gi[id]!=null);
    const mk=(len)=>({id:uid(),k:C.ki[a.kelasId],g:C.gi[a.guruId],pairGs:pairGuruIds.map(id=>C.gi[id]),s:C.si[a.subjekId],
      kelasId:a.kelasId,guruId:a.guruId,pairGuruIds,subjekId:a.subjekId,len,
      kem:sb.kemudahan||'', pagi:!!(sb.pagi||sb.teras), teras:!!sb.teras});
    for(let i=0;i<ganda;i++) units.push(mk(2));
    for(let i=0;i<sisa;i++) units.push(mk(1));
  });
  return {units,tiadaGuru};
}
function unitGuruIndexes(u){ return [...new Set([u.g,...(u.pairGs||[])])]; }

/* ---------- Semakan & letakan ---------- */
function slotSah(C,u,d,p){
  const N=C.N, base=d*N;
  if(p<1||p+u.len-1>C.dayLen[d]) return false;
  if(u.len===2 && C.brk.has(p)) return false;           // jangan merentas rehat
  for(let o=0;o<u.len;o++){
    const c=base+p+o-1;
    if(C.kelasBlok[u.k][c]||unitGuruIndexes(u).some(g=>C.guruBlok[g][c])) return false;
    if(u.kem && C.kem[u.kem] && C.kem[u.kem][c]>=C.kemMax[u.kem]) return false;
  }
  const nS=Math.max(1,C.subjek.length);
  if(C.subDay[u.k][d*nS+u.s]+u.len>C.maxSubjekSehari) return false;
  if(unitGuruIndexes(u).some(g=>C.guruDay[g][d]+u.len>Math.min(C.maxHariGuru,num((C.guru[g]||{}).maxHari,99)))) return false;
  return true;
}
function bebasDi(C,u,d,p){          // tiada pertembungan kelas/guru
  const base=d*C.N;
  for(let o=0;o<u.len;o++){ const c=base+p+o-1;
    if(C.kelasBusy[u.k][c]>=0||unitGuruIndexes(u).some(g=>C.guruBusy[g][c]>=0)) return false; }
  return true;
}
function larianGuruOk(C,g,d,p,len){
  const arr=C.guruBusy[g], base=d*C.N, maxB=C.maxBerturut;
  let left=0,q=p-1;
  while(q>=1 && !C.brk.has(q) && arr[base+q-1]>=0){left++;q--;}
  let right=0; q=p+len;
  while(q<=C.dayLen[d] && !C.brk.has(q-1) && arr[base+q-1]>=0){right++;q++;}
  return left+len+right<=maxB;
}
function larianOk(C,u,d,p){
  return unitGuruIndexes(u).every(g=>larianGuruOk(C,g,d,p,u.len));
}
function letak(C,u,d,p,idx){
  const base=d*C.N, nS=Math.max(1,C.subjek.length);
  for(let o=0;o<u.len;o++){ const c=base+p+o-1;
    C.kelasBusy[u.k][c]=idx; unitGuruIndexes(u).forEach(g=>C.guruBusy[g][c]=idx);
    if(u.kem&&C.kem[u.kem]) C.kem[u.kem][c]++; }
  C.subDay[u.k][d*nS+u.s]+=u.len; unitGuruIndexes(u).forEach(g=>C.guruDay[g][d]+=u.len);
  u.d=d; u.p=p;
}
function buang(C,u){
  if(u.d==null) return;
  const base=u.d*C.N, nS=Math.max(1,C.subjek.length);
  for(let o=0;o<u.len;o++){ const c=base+u.p+o-1;
    C.kelasBusy[u.k][c]=-1; unitGuruIndexes(u).forEach(g=>C.guruBusy[g][c]=-1);
    if(u.kem&&C.kem[u.kem]) C.kem[u.kem][c]--; }
  C.subDay[u.k][u.d*nS+u.s]-=u.len; unitGuruIndexes(u).forEach(g=>C.guruDay[g][u.d]-=u.len);
  u.d=null; u.p=null;
}

/* ---------- Skor lembut ---------- */
function skorSlot(C,u,d,p){
  const K=S.kekangan; let s=0;
  if(K.terasPagi && u.pagi && !waktuPagi(p)) s+=7;
  if(K.elakAkhirTeras && u.teras && p+u.len-1>=C.dayLen[d]) s+=4;
  if(K.sebarHari){ const nS=Math.max(1,C.subjek.length);
    const ada=C.subDay[u.k][d*nS+u.s], ideal=C.ideal[u.k][u.s];
    s+=Math.max(0,(ada+u.len)-ideal)*6; }
  if(K.elakLubang){
    unitGuruIndexes(u).forEach(g=>{
      const arr=C.guruBusy[g], base=d*C.N;
      let kiri=p-1, kanan=p+u.len;
      let jrkKiri=0; while(kiri>=1 && arr[base+kiri-1]<0){jrkKiri++;kiri--;}
      let jrkKanan=0; while(kanan<=C.dayLen[d] && arr[base+kanan-1]<0){jrkKanan++;kanan++;}
      if(kiri>=1&&jrkKiri>0) s+=jrkKiri*2;
      if(kanan<=C.dayLen[d]&&jrkKanan>0) s+=jrkKanan*2;
    });
  }
  s+=unitGuruIndexes(u).reduce((jumlah,g)=>jumlah+C.guruDay[g][d],0)*0.6;
  s+=p*0.08;                        // sedikit keutamaan waktu awal
  return s;
}
function kosKeseluruhan(C,units){
  const K=S.kekangan; let kos=0;
  units.forEach(u=>{ if(u.d==null){kos+=200;return;}
    if(K.terasPagi&&u.pagi&&!waktuPagi(u.p)) kos+=7;
    if(K.elakAkhirTeras&&u.teras&&u.p+u.len-1>=C.dayLen[u.d]) kos+=4;
  });
  const nS=Math.max(1,C.subjek.length);
  if(K.sebarHari) for(let k=0;k<C.kelas.length;k++) for(let d=0;d<C.D;d++) for(let s=0;s<nS;s++){
    const v=C.subDay[k][d*nS+s], id=C.ideal[k][s]; if(v>id) kos+=(v-id)*5; }
  if(K.elakLubang) for(let g=0;g<C.guru.length;g++) for(let d=0;d<C.D;d++){
    const arr=C.guruBusy[g], base=d*C.N; let first=-1,last=-1;
    for(let p=1;p<=C.dayLen[d];p++){ if(arr[base+p-1]>=0){ if(first<0)first=p; last=p; } }
    if(first<0) continue; let lubang=0;
    for(let p=first;p<=last;p++) if(arr[base+p-1]<0) lubang++;
    kos+=lubang*3;
  }
  return kos;
}

/* ---------- Satu percubaan ---------- */
function rnd(seedObj){ seedObj.s=(seedObj.s*1664525+1013904223)>>>0; return seedObj.s/4294967296; }
function shuffle(a,sd){ for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd(sd)*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function cariSlotTerbaik(C,u,sd){
  let best=null,bestS=Infinity;
  const hariOrder=Array.from({length:C.D},(_,i)=>i);
  shuffle(hariOrder,sd);
  for(const d of hariOrder){
    for(let p=1;p+u.len-1<=C.dayLen[d];p++){
      if(!slotSah(C,u,d,p)||!bebasDi(C,u,d,p)) continue;
      if(!larianOk(C,u,d,p)) continue;
      const s=skorSlot(C,u,d,p)+rnd(sd)*1.2;
      if(s<bestS){bestS=s;best={d,p};}
    }
  }
  return best;
}
function cariSlotUsir(C,u,units,sd){
  let best=null,bestS=Infinity;
  for(let d=0;d<C.D;d++) for(let p=1;p+u.len-1<=C.dayLen[d];p++){
    if(!slotSah(C,u,d,p)) continue;
    const base=d*C.N, ev=new Set();
    for(let o=0;o<u.len;o++){ const c=base+p+o-1;
      const a=C.kelasBusy[u.k][c];
      if(a>=0) ev.add(a); unitGuruIndexes(u).forEach(g=>{const b=C.guruBusy[g][c];if(b>=0) ev.add(b);}); }
    if(ev.size>2) continue;
    const s=ev.size*100+skorSlot(C,u,d,p)+rnd(sd)*3;
    if(s<bestS){bestS=s;best={d,p,ev:Array.from(ev)};}
  }
  return best;
}

function cubaSekali(C,units,seed,terkunci){
  resetKonteks(C);
  const sd={s:(seed>>>0)||1};
  units.forEach(u=>{u.d=null;u.p=null;});
  // slot terkunci diletakkan dahulu
  (terkunci||[]).forEach((t,i)=>{
    const u=units[t.idx]; if(!u) return;
    if(slotSah(C,u,t.d,t.p)&&bebasDi(C,u,t.d,t.p)) letak(C,u,t.d,t.p,t.idx);
  });
  const order=units.map((u,i)=>i).filter(i=>units[i].d==null);
  // susun: blok panjang & subjek berkekangan dahulu
  order.sort((a,b)=>{
    const A=units[a],B=units[b];
    if(B.len!==A.len) return B.len-A.len;
    if(!!B.kem!==!!A.kem) return (B.kem?1:0)-(A.kem?1:0);
    return (B.pagi?1:0)-(A.pagi?1:0);
  });
  // sedikit rawak dalam kumpulan sama
  for(let i=0;i<order.length-1;i++) if(rnd(sd)<0.3){const j=Math.min(order.length-1,i+1);[order[i],order[j]]=[order[j],order[i]];}

  const gagal=[];
  for(const i of order){
    const u=units[i];
    const slot=cariSlotTerbaik(C,u,sd);
    if(slot) letak(C,u,slot.d,slot.p,i); else gagal.push(i);
  }
  // pembaikan min-conflicts
  let iter=0, maxIter=Math.max(800,units.length*12);
  const antrian=gagal.slice();
  while(antrian.length&&iter<maxIter){
    iter++;
    const i=antrian.shift(); const u=units[i];
    let slot=cariSlotTerbaik(C,u,sd);
    if(slot){ letak(C,u,slot.d,slot.p,i); continue; }
    slot=cariSlotUsir(C,u,units,sd);
    if(!slot){ antrian.push(i); if(iter>maxIter-1) break; continue; }
    slot.ev.forEach(j=>{ buang(C,units[j]); antrian.push(j); });
    if(slotSah(C,u,slot.d,slot.p)&&bebasDi(C,u,slot.d,slot.p)) letak(C,u,slot.d,slot.p,i);
    else antrian.push(i);
  }
  const belum=units.map((u,i)=>i).filter(i=>units[i].d==null);
  return {belum,kos:kosKeseluruhan(C,units)};
}

/* ---------- Pendakian bukit (perbaiki kualiti) ---------- */
function perbaiki(C,units,seed,pusingan){
  const sd={s:(seed>>>0)||7};
  let kos=kosKeseluruhan(C,units);
  const idxAda=units.map((u,i)=>i).filter(i=>units[i].d!=null);
  if(!idxAda.length) return kos;
  for(let it=0;it<pusingan;it++){
    const i=idxAda[Math.floor(rnd(sd)*idxAda.length)];
    const u=units[i]; if(u.d==null) continue;
    const od=u.d, op=u.p;
    buang(C,u);
    const d=Math.floor(rnd(sd)*C.D);
    const p=1+Math.floor(rnd(sd)*Math.max(1,C.dayLen[d]-u.len+1));
    if(slotSah(C,u,d,p)&&bebasDi(C,u,d,p)&&larianOk(C,u,d,p)){
      letak(C,u,d,p,i);
      const baru=kosKeseluruhan(C,units);
      if(baru<=kos){ kos=baru; continue; }
      buang(C,u);
    }
    letak(C,u,od,op,i);
  }
  return kos;
}

/* ---------- Entri utama ---------- */
async function janaJadual(opt,onProg){
  opt=opt||{};
  const C=binaKonteks();
  const {units,tiadaGuru}=binaUnit(C);
  if(!units.length) return {ok:false, mesej:'Tiada waktu untuk dijadualkan. Periksa Peruntukan Waktu & Agihan Guru.', tiadaGuru};
  // slot terkunci sedia ada
  let terkunci=[];
  if(opt.kekalKunci && S.jadual&&S.jadual.slots){
    const kunci=S.jadual.slots.filter(x=>x.kunci);
    const guna=new Set();
    kunci.forEach(x=>{
      const d=C.hari.indexOf(x.hari); if(d<0) return;
      const idx=units.findIndex((u,i)=>!guna.has(i)&&u.kelasId===x.kelasId&&u.subjekId===x.subjekId&&u.guruId===x.guruId&&u.len===num(x.panjang,1));
      if(idx>=0){ guna.add(idx); terkunci.push({idx,d,p:num(x.mula,1)}); }
    });
  }
  const cubaan=Math.max(4,num(S.kekangan.cubaan,60));
  let best=null;
  const t0=performance.now();
  for(let c=0;c<cubaan;c++){
    const r=cubaSekali(C,units,12345+c*7919,terkunci);
    if(r.belum.length===0) perbaiki(C,units,999+c,Math.min(2500,units.length*8));
    const kos=kosKeseluruhan(C,units);
    const skor=r.belum.length*1000+kos;
    if(!best||skor<best.skor){
      best={skor,belum:r.belum.slice(),kos,
        letakan:units.map(u=>u.d==null?null:{d:u.d,p:u.p})};
    }
    if(c%3===0){ onProg&&onProg((c+1)/cubaan, best); await new Promise(r=>setTimeout(r,0)); }
    if(best.belum.length===0 && best.kos<=0) break;
  }
  onProg&&onProg(1,best);
  // bina semula keadaan terbaik
  resetKonteks(C);
  units.forEach(u=>{u.d=null;u.p=null;});
  best.letakan.forEach((L,i)=>{ if(L) letak(C,units[i],L.d,L.p,i); });
  const kunciLama={};
  if(opt.kekalKunci&&S.jadual&&S.jadual.slots)
    S.jadual.slots.filter(x=>x.kunci).forEach(x=>kunciLama[[x.kelasId,x.subjekId,x.hari,x.mula].join('|')]=1);
  const slots=[];
  units.forEach(u=>{ if(u.d==null) return;
    const hari=C.hari[u.d];
    const guruIds=[u.guruId,...(u.pairGuruIds||[])],pairing=guruIds.length>1;
    guruIds.forEach(guruId=>slots.push({id:uid(),kelasId:u.kelasId,subjekId:u.subjekId,guruId,
      hari,mula:u.p,panjang:u.len,pairing,kunci:!!kunciLama[[u.kelasId,u.subjekId,hari,u.p].join('|')]}));
  });
  const gagalDetail=best.belum.map(i=>({kelas:namaKelas(units[i].kelasId),subjek:kodSubjek(units[i].subjekId),
    guru:[units[i].guruId,...(units[i].pairGuruIds||[])].map(id=>namaGuru(id)).join(' / '),len:units[i].len}));
  return {ok:true, slots, gagal:gagalDetail, kos:best.kos, tiadaGuru,
          masa:Math.round(performance.now()-t0), jumUnit:units.length};
}

/* ============================================================
   SEMAKAN PERTEMBUNGAN (pengesahan)
   ============================================================ */
function semakJadual(){
  const isu=[];
  if(!S.jadual||!S.jadual.slots) return isu;
  const petaG={},petaK={},kemP={};
  const nS=S.subjek.length;
  const subHari={}, bebanHari={};
  S.jadual.slots.forEach(x=>{
    for(let o=0;o<num(x.panjang,1);o++){
      const p=num(x.mula,1)+o, key=x.hari+'-'+p;
      if(p>waktuHari(x.hari)) isu.push({t:'luar',m:`${namaKelas(x.kelasId)} ${kodSubjek(x.subjekId)} pada ${x.hari} waktu ${p} melebihi bilangan waktu hari tersebut`});
      const gk=x.guruId+'|'+key, kk=x.kelasId+'|'+key;
      if(petaG[gk]) isu.push({t:'guru',m:`Guru ${namaGuru(x.guruId)} bertembung pada ${x.hari} waktu ${p} (${kodSubjek(petaG[gk].subjekId)} ${namaKelas(petaG[gk].kelasId)} vs ${kodSubjek(x.subjekId)} ${namaKelas(x.kelasId)})`});
      else petaG[gk]=x;
      if(petaK[kk] && !(petaK[kk].pairing&&x.pairing)) isu.push({t:'kelas',m:`Kelas ${namaKelas(x.kelasId)} bertembung pada ${x.hari} waktu ${p}`});
      else if(!petaK[kk]) petaK[kk]=x;
      const sb=subjekById(x.subjekId);
      if(sb&&sb.kemudahan){ const kk2=sb.kemudahan+'|'+key; kemP[kk2]=(kemP[kk2]||0)+1;
        const had=num((S.kekangan.kapasiti||{})[sb.kemudahan],2);
        if(kemP[kk2]===had+1) isu.push({t:'kem',m:`Kemudahan ${sb.kemudahan} melebihi had (${had}) pada ${x.hari} waktu ${p}`});
      }
      const bh=x.guruId+'|'+x.hari; bebanHari[bh]=(bebanHari[bh]||0)+1;
    }
    const shk=x.kelasId+'|'+x.subjekId+'|'+x.hari;
    subHari[shk]=subHari[shk]||new Set();
    for(let o=0;o<num(x.panjang,1);o++) subHari[shk].add(num(x.mula,1)+o);
  });
  // slot tetap bertembung
  (S.acara||[]).forEach(a=>{
    for(let o=0;o<num(a.panjang,1);o++){
      const p=num(a.mula,1)+o, key=a.hari+'-'+p;
      const sasarK = a.skop==='semua'?S.kelas.map(k=>k.id):(a.skop==='kelas'?(a.kelas||[]):[]);
      sasarK.forEach(kid=>{ if(petaK[kid+'|'+key]) isu.push({t:'acara',m:`Slot tetap ${a.kod} bertembung dengan kelas ${namaKelas(kid)} pada ${a.hari} waktu ${p}`}); });
      const sasarG = a.skop==='semua'?S.guru.map(g=>g.id):(a.skop==='guru'?(a.guru||[]):[]);
      sasarG.forEach(gid=>{ if(petaG[gid+'|'+key]) isu.push({t:'acara',m:`Slot tetap ${a.kod} bertembung dengan guru ${namaGuru(gid)} pada ${a.hari} waktu ${p}`}); });
    }
  });
  // guru tidak tersedia
  S.guru.forEach(g=>(g.tidakAda||[]).forEach(k=>{ if(petaG[g.id+'|'+k])
    isu.push({t:'tidakada',m:`${g.nama} dijadualkan pada waktu tidak tersedia (${k.replace('-',' waktu ')})`}); }));
  // had harian & subjek sehari
  Object.keys(bebanHari).forEach(k=>{
    const [gid,h]=k.split('|'); const g=guruById(gid); if(!g) return;
    const had=Math.min(num(S.kekangan.maxHariGuru,8),num(g.maxHari,99));
    if(bebanHari[k]>had) isu.push({t:'beban',m:`${g.nama} ada ${bebanHari[k]} waktu pada ${h} (had ${had})`});
  });
  Object.keys(subHari).forEach(k=>{
    const [kid,sid,h]=k.split('|');
    if(subHari[k].size>num(S.kekangan.maxSubjekSehari,2))
      isu.push({t:'subjek',m:`${namaKelas(kid)} ada ${subHari[k].size} waktu ${kodSubjek(sid)} pada ${h} (had ${num(S.kekangan.maxSubjekSehari,2)})`});
  });
  // kekurangan waktu berbanding peruntukan
  segerakAgihan();
  S.agihan.forEach(a=>{
    const perlu=waktuEfektif(a); if(perlu<=0) return;
    const waktuAda=new Set();
    S.jadual.slots.filter(x=>x.kelasId===a.kelasId&&x.subjekId===a.subjekId)
      .forEach(x=>{for(let o=0;o<num(x.panjang,1);o++) waktuAda.add(`${x.hari}|${num(x.mula,1)+o}`);});
    const ada=waktuAda.size;
    if(ada!==perlu) isu.push({t:'kurang',m:`${namaKelas(a.kelasId)} — ${kodSubjek(a.subjekId)}: ${ada}/${perlu} waktu dijadualkan`});
  });
  return isu;
}


/* ============================================================
   JANA JADUAL
   ============================================================ */
let janaSedangJalan=false;
VIEWS.jana={t:'Jana Jadual', r(){
  const st=stat();
  return `<div class="card"><h3>Jana Jadual Automatik</h3>
    <p class="hint">Sistem akan cuba menyusun semua waktu tanpa pertembungan guru &amp; kelas, sambil mematuhi kekangan yang ditetapkan.</p>
    <div class="kpi" style="margin-bottom:12px">
      <div class="k"><b>${st.jumWaktu}</b><span>Waktu perlu disusun</span></div>
      <div class="k"><b>${st.tanpaGuru}</b><span>Tanpa guru</span></div>
      <div class="k"><b>${S.kelas.length}</b><span>Kelas</span></div>
      <div class="k"><b>${(S.acara||[]).length}</b><span>Slot tetap</span></div>
    </div>
    ${amaranAwal()}
    ${st.tanpaGuru?`<div class="alert warn">${st.tanpaGuru} waktu tiada guru dan <b>tidak akan dijadualkan</b>. Lengkapkan di Agihan Guru.</div>`:''}
    ${st.baki<0?`<div class="alert bad">Peruntukan melebihi kapasiti sebanyak ${-st.baki} waktu — penjanaan pasti tidak lengkap.</div>`:''}
    <label class="chk"><input type="checkbox" id="jKunci" checked> Kekalkan slot yang dikunci 🔒 daripada jadual sedia ada</label>
    <div class="row" style="margin-top:12px">
      <button class="btn pri" id="btnJana" ${st.jumWaktu?'':'disabled'}>✨ Jana Jadual</button>
      ${bilJadual()?`<button class="btn" onclick="go('lihat')">🗓️ Lihat jadual semasa</button>`:''}
      <button class="btn" onclick="janaJadualGantianUI()">👥 Jana jadual gantian</button>
    </div>
    <p class="hint">Guru MySTEP/praktikal yang ada "Menggantikan guru" pada kad mereka: butang ini menyalin waktu guru yang diganti sebagai agihan mereka sendiri, supaya Jana Jadual menyusun jadual mereka juga. Kelas yang dikongsi bersama guru praktikal tetap ada pada guru asal.</p>
    <div id="janaProg" class="hidden" style="margin-top:14px">
      <div class="prog"><i id="progBar"></i></div>
      <p class="muted" id="progTxt" style="margin-top:6px">Menyusun…</p>
    </div>
    <div id="janaHasil" style="margin-top:14px"></div>
  </div>
  ${bilJadual()?laporanSemak():''}`;
}, after(){
  const b=$('#btnJana'); if(b) b.onclick=mulaJana;
}};

/** Semakan sebelum jana — kesan kekangan yang mustahil dipenuhi */
function amaranAwal(){
  segerakAgihan();
  const a=[], D=S.hari.length, maxS=num(S.kekangan.maxSubjekSehari,3);
  S.agihan.forEach(x=>{ const w=waktuEfektif(x); if(w<=0) return;
    if(w>maxS*D) a.push(`<b>${esc(namaKelas(x.kelasId))} — ${esc(kodSubjek(x.subjekId))}</b>: ${w} waktu tetapi had “maks subjek sehari” ialah ${maxS} × ${D} hari = ${maxS*D}. Naikkan had di <b>Kekangan</b> atau kurangkan waktu.`);
  });
  // beban guru
  const bebanG={}; S.agihan.forEach(x=>{ if(x.guruId) bebanG[x.guruId]=(bebanG[x.guruId]||0)+waktuEfektif(x); });
  S.guru.forEach(g=>{ const had=Math.min(num(S.kekangan.maxHariGuru,8),num(g.maxHari,99))*D;
    if((bebanG[g.id]||0)>had) a.push(`<b>${esc(g.nama)}</b>: ${bebanG[g.id]} waktu melebihi had ${had} (maks ${Math.min(num(S.kekangan.maxHariGuru,8),num(g.maxHari,99))} waktu/hari × ${D} hari).`); });
  // kapasiti kelas
  const kap=S.hari.reduce((s,h)=>s+waktuHari(h),0);
  S.kelas.forEach(k=>{
    const jum=S.agihan.filter(x=>x.kelasId===k.id).reduce((s,x)=>s+waktuEfektif(x),0);
    const ac=(S.acara||[]).filter(x=>x.skop==='semua'||(x.skop==='kelas'&&(x.kelas||[]).includes(k.id)))
      .reduce((s,x)=>s+num(x.panjang,1),0);
    if(jum+ac>kap) a.push(`<b>${esc(k.nama)}</b>: ${jum} waktu + ${ac} slot tetap melebihi kapasiti ${kap} waktu seminggu.`);
  });
  if(!a.length) return '';
  return `<div class="alert bad"><b>Kekangan berikut mustahil dipenuhi:</b>
    <ul style="margin:6px 0 0 18px">${a.slice(0,12).map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
}

async function mulaJana(){
  if(janaSedangJalan) return; janaSedangJalan=true;
  const kekalKunci=$('#jKunci')?$('#jKunci').checked:false;
  $('#btnJana').disabled=true; $('#janaProg').classList.remove('hidden');
  $('#janaHasil').innerHTML='';
  try{
    const r=await janaJadual({kekalKunci},(pct,best)=>{
      $('#progBar').style.width=Math.round(pct*100)+'%';
      $('#progTxt').textContent=`Menyusun… ${Math.round(pct*100)}% · terbaik setakat ini: ${best?best.belum.length:'—'} blok belum berjaya`;
    });
    if(!r.ok){ $('#janaHasil').innerHTML=`<div class="alert bad">${esc(r.mesej)}</div>`; }
    else{
      ubah(()=>{ S.jadual={slots:r.slots, dijana:new Date().toISOString(), kos:r.kos}; });
      const isu=semakJadual().filter(i=>i.t!=='kurang');
      $('#janaHasil').innerHTML=`
        <div class="alert ${r.gagal.length?'warn':'ok'}">
          ${r.gagal.length? `⚠️ ${r.gagal.length} blok tidak dapat diletakkan.` : '✅ Semua waktu berjaya disusun tanpa pertembungan.'}
          <br><small>${r.jumUnit} blok · ${r.masa} ms · skor kekangan lembut ${r.kos}</small>
        </div>
        ${isu.length?`<div class="alert bad">Terdapat ${isu.length} isu — lihat laporan di bawah.</div>`:''}
        ${r.gagal.length?`<div class="tblwrap" style="margin-top:8px"><table class="dt"><thead><tr><th>Kelas</th><th>Subjek</th><th>Guru</th><th>Blok</th></tr></thead><tbody>
          ${r.gagal.map(g=>`<tr><td>${esc(g.kelas)}</td><td>${esc(g.subjek)}</td><td>${esc(g.guru)}</td><td>${g.len} waktu</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted" style="margin-top:8px">Cadangan: kurangkan peruntukan waktu, longgarkan kekangan (maks berturut / maks subjek sehari), tambah bilangan waktu sehari, atau agihkan semula guru.</p>`:''}
        <div class="row" style="margin-top:12px"><button class="btn pri" onclick="go('lihat')">🗓️ Lihat &amp; Edit Jadual</button>
        <button class="btn" onclick="go('cetak')">🖨️ Cetak</button></div>`;
      toast(r.gagal.length?`Selesai — ${r.gagal.length} blok gagal`:'Jadual berjaya dijana', r.gagal.length?'warn':'ok');
    }
  }catch(e){ $('#janaHasil').innerHTML=`<div class="alert bad">Ralat: ${esc(e.message)}</div>`; }
  $('#btnJana').disabled=false; $('#janaProg').classList.add('hidden'); janaSedangJalan=false;
}
function laporanSemak(){
  const isu=semakJadual();
  const keras=isu.filter(i=>['guru','kelas','acara','tidakada','luar','kem'].includes(i.t));
  const lain=isu.filter(i=>!keras.includes(i));
  return `<div class="card"><h3>Laporan Semakan</h3>
    ${keras.length?`<div class="alert bad"><b>${keras.length} pertembungan / pelanggaran keras</b></div>
      <ul style="margin:0 0 10px 18px;font-size:13.5px">${keras.slice(0,40).map(i=>`<li>${esc(i.m)}</li>`).join('')}</ul>`
     :`<div class="alert ok">✅ Tiada pertembungan guru, kelas, kemudahan atau slot tetap.</div>`}
    ${lain.length?`<div class="alert warn"><b>${lain.length} amaran</b></div>
      <ul style="margin:0 0 0 18px;font-size:13.5px">${lain.slice(0,40).map(i=>`<li>${esc(i.m)}</li>`).join('')}</ul>`:''}
  </div>`;
}

/* ============================================================
   MATRIKS JADUAL
   ============================================================ */
function acaraUntuk(mode,id){
  return (S.acara||[]).filter(a=>{
    if(a.skop==='semua') return true;
    if(mode==='kelas') return a.skop==='kelas'&&(a.kelas||[]).includes(id);
    if(mode==='guru')  return a.skop==='guru' &&(a.guru ||[]).includes(id);
    return false;
  });
}
/** matriks[d][p] = {jenis:'w'|'a', ref, mula:bool, len} */
function matriks(mode,id){
  const N=maxWaktu(), m=S.hari.map(()=>Array(N+2).fill(null));
  const slots=(S.jadual&&S.jadual.slots||[]).filter(x=>mode==='kelas'?x.kelasId===id:x.guruId===id);
  slots.forEach(x=>{ const d=S.hari.indexOf(x.hari); if(d<0) return;
    for(let o=0;o<num(x.panjang,1);o++){ const p=num(x.mula,1)+o; if(p<1||p>N) continue;
      const current=m[d][p];
      if(mode==='kelas'&&current?.jenis==='w'&&current.ref.pairing&&x.pairing){
        current.refs=current.refs||[current.ref];
        if(!current.refs.some(ref=>ref.id===x.id)) current.refs.push(x);
      } else m[d][p]={jenis:'w',ref:x,refs:[x],mula:o===0,len:num(x.panjang,1)};
    } });
  acaraUntuk(mode,id).forEach(a=>{ const d=S.hari.indexOf(a.hari); if(d<0) return;
    for(let o=0;o<num(a.panjang,1);o++){ const p=num(a.mula,1)+o; if(p<1||p>N) continue;
      if(!m[d][p]) m[d][p]={jenis:'a',ref:a,mula:o===0,len:num(a.panjang,1)}; } });
  return m;
}
/** {sudut: label kecil di penjuru, utama: teks besar tengah, kecil: teks kecil bawah} */
function teksSel(mode,c){
  if(c.jenis==='a'){ const a=c.ref;
    return {sudut:'', utama:esc(a.kod), kecil:'', warna:a.warna||'#eeeeee'}; }
  const x=c.ref;
  if(mode==='kelas') return {sudut:'', utama:esc(kodSubjek(x.subjekId)),
    kecil:esc([...(c.refs||[x])].map(ref=>namaGuru(ref.guruId,true)).filter((nama,index,list)=>nama&&list.indexOf(nama)===index).join(' / ')), warna:warnaSubjek(x.subjekId)};
  return {sudut:esc(kodSubjek(x.subjekId)), utama:esc(namaKelas(x.kelasId)), kecil:'',
    warna:warnaSubjek(x.subjekId)};
}

/** Saiz fon automatik mengikut panjang teks supaya muat dalam sel */
function szTeks(txt,cetak){
  const L=(txt||'').length;
  if(cetak) return L<=3?19:L<=5?15:L<=8?12:L<=12?10:8.5;
  return L<=3?15:L<=6?12.5:L<=9?11:9.5;
}

/* ---------- Grid skrin (boleh edit) ---------- */
let pilihSlot=null;
function gridSkrin(mode,id,bolehEdit){
  const N=maxWaktu(), m=matriks(mode,id), jm=jalurMasa(), reh=rehatSelepas();
  const pra=S.masa.pra&&S.masa.pra.aktif;
  let head=`<tr><th class="day"></th>`;
  if(pra) head+=`<th class="pnum">0<span class="tm">${esc(S.masa.pra.mula)}</span></th>`;
  for(let p=1;p<=N;p++){
    head+=`<th class="pnum">${p}<span class="tm">${jm[p-1].mula}</span></th>`;
    if(reh[p]) head+=`<th class="pnum" style="width:30px"></th>`;
  }
  head+=`</tr>`;
  let body='';
  S.hari.forEach((h,d)=>{
    body+=`<tr><td class="day">${HARI_PENDEK[h]||h.slice(0,3)}</td>`;
    if(pra&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">${esc(S.masa.pra.label)}</td>`;
    for(let p=1;p<=N;p++){
      const c=m[d][p];
      if(c&&!c.mula){ if(reh[p]&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">REHAT</td>`; continue; }
      if(p>waktuHari(h)){ body+=`<td style="background:repeating-linear-gradient(45deg,transparent,transparent 5px,var(--line) 5px,var(--line) 6px)"></td>`; }
      else if(!c){ body+=`<td class="free ${bolehEdit?'pick':''}" data-d="${d}" data-p="${p}"></td>`; }
      else{
        const t=teksSel(mode,c);
        const sel=pilihSlot&&c.jenis==='w'&&c.ref.id===pilihSlot?' sel':'';
        body+=`<td class="has${sel} ${bolehEdit&&c.jenis==='w'?'pick':''}" colspan="${c.len}"
          data-slot="${c.jenis==='w'?c.ref.id:''}" style="--sc:${esc(t.warna)}">
          <div class="cell">${t.sudut?`<span class="sub" style="color:#222">${t.sudut}${c.jenis==='w'&&c.ref.kunci?' 🔒':''}</span>`:''}
            <span class="cls" style="color:#111;font-size:${szTeks(t.utama)}px">${t.utama}${!t.sudut&&c.jenis==='w'&&c.ref.kunci?' 🔒':''}</span>
            ${t.kecil?`<span class="gr" style="color:#444">${t.kecil}</span>`:''}</div></td>`;
      }
      if(reh[p]&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">REHAT</td>`;
    }
    body+=`</tr>`;
  });
  return `<div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="scrollhint">↔ Leret ke kiri/kanan untuk melihat semua waktu.</p>`;
}

/* ============================================================
   LIHAT & EDIT
   ============================================================ */
let lihatMod='guru', lihatId=null;
VIEWS.lihat={t:'Lihat & Edit Jadual', r(){
  if(!bilJadual()) return `<div class="card"><div class="alert warn">Belum ada jadual. Sila <b>Jana Jadual</b> dahulu.</div>
    <button class="btn pri" onclick="go('jana')">✨ Jana Jadual</button></div>`;
  const senarai = lihatMod==='guru'?S.guru:S.kelas;
  if(!lihatId||!senarai.some(x=>x.id===lihatId)) lihatId=senarai.length?senarai[0].id:null;
  return `<div class="card">
    <div class="row">
      <div class="seg">
        <button class="${lihatMod==='guru'?'on':''}" onclick="lihatMod='guru';lihatId=null;pilihSlot=null;ulang()">Guru</button>
        <button class="${lihatMod==='kelas'?'on':''}" onclick="lihatMod='kelas';lihatId=null;pilihSlot=null;ulang()">Kelas</button>
        <button class="${lihatMod==='induk'?'on':''}" onclick="lihatMod='induk';pilihSlot=null;ulang()">Induk</button>
      </div>
      ${lihatMod!=='induk'?`<div style="flex:1;min-width:200px;max-width:340px">
        <select onchange="lihatId=this.value;pilihSlot=null;ulang()">
          ${senarai.map(x=>`<option value="${x.id}" ${x.id===lihatId?'selected':''}>${esc(x.nama)}</option>`).join('')}</select></div>`:''}
      <div class="right"><button class="btn" onclick="go('cetak')">🖨️ Cetak</button></div>
    </div>
    ${lihatMod!=='induk'?`<div class="alert info" style="margin-top:12px">Klik satu blok untuk memilih, kemudian klik slot kosong untuk mengalihkannya. Klik semula blok yang sama untuk membuka menu (kunci / padam).</div>`:''}
  </div>
  <div class="card">${lihatMod==='induk'?gridInduk():gridSkrin(lihatMod,lihatId,true)}
  ${lihatMod!=='induk'?legendSubjek():''}</div>`;
}, after(){
  if(lihatMod==='induk') return;
  $$('#content td.pick').forEach(td=>td.onclick=()=>{
    const sid=td.dataset.slot;
    if(sid){
      if(pilihSlot===sid){ menuSlot(sid); return; }
      pilihSlot=sid; ulang(); return;
    }
    if(pilihSlot){ alihSlot(pilihSlot,S.hari[num(td.dataset.d)],num(td.dataset.p)); }
  });
}};
function legendSubjek(){
  return `<div class="legend">${S.subjek.map(s=>`<i><b style="background:${esc(s.warna)}"></b>${esc(s.kod)} — ${esc(s.nama)}</i>`).join('')}</div>`;
}
function slotById(id){ return (S.jadual&&S.jadual.slots||[]).find(x=>x.id===id); }
function bolehLetak(slot,hari,mula){
  const N=maxWaktu(), len=num(slot.panjang,1);
  if(mula<1||mula+len-1>waktuHari(hari)) return 'Melebihi bilangan waktu hari itu';
  if(len===2&&rehatSet().has(mula)) return 'Blok 2 waktu tidak boleh merentas rehat';
  for(let o=0;o<len;o++){
    const p=mula+o;
    const bentrokK=(S.jadual.slots||[]).some(x=>x!==slot&&x.kelasId===slot.kelasId&&x.hari===hari&&p>=num(x.mula,1)&&p<num(x.mula,1)+num(x.panjang,1));
    if(bentrokK) return 'Kelas sudah ada kelas lain pada waktu itu';
    const bentrokG=(S.jadual.slots||[]).some(x=>x!==slot&&x.guruId===slot.guruId&&x.hari===hari&&p>=num(x.mula,1)&&p<num(x.mula,1)+num(x.panjang,1));
    if(bentrokG) return 'Guru sudah mengajar kelas lain pada waktu itu';
    const ac=(S.acara||[]).find(a=>a.hari===hari&&p>=num(a.mula,1)&&p<num(a.mula,1)+num(a.panjang,1)&&
      (a.skop==='semua'||(a.skop==='kelas'&&(a.kelas||[]).includes(slot.kelasId))||(a.skop==='guru'&&(a.guru||[]).includes(slot.guruId))));
    if(ac) return 'Bertembung dengan slot tetap '+ac.kod;
    const g=guruById(slot.guruId);
    if(g&&(g.tidakAda||[]).includes(hari+'-'+p)) return 'Guru ditanda tidak tersedia pada waktu itu';
    const sb=subjekById(slot.subjekId);
    if(sb&&sb.kemudahan){
      const guna=(S.jadual.slots||[]).filter(x=>x!==slot&&x.hari===hari&&p>=num(x.mula,1)&&p<num(x.mula,1)+num(x.panjang,1)
        &&(subjekById(x.subjekId)||{}).kemudahan===sb.kemudahan).length;
      if(guna>=num((S.kekangan.kapasiti||{})[sb.kemudahan],2)) return `Kemudahan ${sb.kemudahan} sudah penuh`;
    }
  }
  return '';
}
function alihSlot(id,hari,mula){
  const s=slotById(id); if(!s) return;
  const sebab=bolehLetak(s,hari,mula);
  if(sebab){ toast(sebab,'bad'); return; }
  ubah(()=>{ s.hari=hari; s.mula=mula; });
  pilihSlot=null; ulang(); toast('Dialihkan');
}
function menuSlot(id){
  const s=slotById(id); if(!s) return;
  $('#dlgBody').innerHTML=`<h3>${esc(kodSubjek(s.subjekId))} — ${esc(namaKelas(s.kelasId))}</h3>
    <p class="muted">${esc(namaGuru(s.guruId))} · ${esc(s.hari)} waktu ${s.mula}${s.panjang>1?'–'+(s.mula+s.panjang-1):''}</p>
    <div class="grid g2" style="margin-top:10px">
      <div><label class="f">Tukar guru</label><select id="msG">
        ${S.guru.map(g=>`<option value="${g.id}" ${g.id===s.guruId?'selected':''}>${esc(g.nama)}</option>`).join('')}</select></div>
      <div><label class="f">Hari</label><select id="msH">${S.hari.map(h=>`<option ${h===s.hari?'selected':''}>${h}</option>`).join('')}</select></div>
      <div><label class="f">Waktu mula</label><input type="number" id="msP" min="1" max="${maxWaktu()}" value="${s.mula}"></div>
      <div><label class="f">Panjang (waktu)</label><input type="number" id="msL" min="1" max="4" value="${num(s.panjang,1)}"></div>
    </div>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="msK" ${s.kunci?'checked':''}> 🔒 Kunci blok ini (kekal semasa jana semula)</label>
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <button class="btn dgr" id="msPadam">Padam blok</button>
      <span><button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" id="msSimpan">Simpan</button></span></div>`;
  const d=$('#dlg'); d.showModal();
  $('#msPadam').onclick=()=>{ ubah(()=>S.jadual.slots=S.jadual.slots.filter(x=>x.id!==id)); d.close(); pilihSlot=null; ulang(); toast('Dipadam'); };
  $('#msSimpan').onclick=()=>{
    const uji=Object.assign({},s,{guruId:$('#msG').value,hari:$('#msH').value,mula:num($('#msP').value,1),panjang:num($('#msL').value,1)});
    const tiruan=Object.assign(Object.create(Object.getPrototypeOf(s)),uji);
    // gunakan objek asal untuk pengecualian diri
    const simpanLama={guruId:s.guruId,hari:s.hari,mula:s.mula,panjang:s.panjang};
    Object.assign(s,uji);
    const sebab=bolehLetak(s,s.hari,s.mula);
    if(sebab){ Object.assign(s,simpanLama); toast(sebab,'bad'); return; }
    s.kunci=$('#msK').checked; simpan(true); d.close(); pilihSlot=null; ulang(); toast('Dikemas kini');
  };
}

/* ---------- Jadual induk (skrin) ---------- */
let indukHari=null;
function gridInduk(){
  const N=maxWaktu(); if(!indukHari||!S.hari.includes(indukHari)) indukHari=S.hari[0];
  const jm=jalurMasa(), reh=rehatSelepas();
  let head=`<tr><th class="day" style="width:120px">Kelas</th>`;
  for(let p=1;p<=N;p++){ head+=`<th class="pnum">${p}<span class="tm">${jm[p-1].mula}</span></th>`;
    if(reh[p]) head+=`<th style="width:26px"></th>`; }
  head+='</tr>';
  let body='';
  S.kelas.forEach(k=>{
    const m=matriks('kelas',k.id), d=S.hari.indexOf(indukHari);
    body+=`<tr><td class="day" style="width:120px;font-size:12px">${esc(k.nama)}</td>`;
    for(let p=1;p<=N;p++){
      const c=m[d][p];
      if(c&&!c.mula){ if(reh[p]) body+=''; continue; }
      if(p>waktuHari(indukHari)) body+=`<td style="background:repeating-linear-gradient(45deg,transparent,transparent 5px,var(--line) 5px,var(--line) 6px)"></td>`;
      else if(!c) body+=`<td></td>`;
      else{ const t=teksSel('kelas',c);
        body+=`<td class="has" colspan="${c.len}" style="--sc:${esc(t.warna)}"><div class="cell">
          <span class="cls" style="color:#111;font-size:${szTeks(t.utama)}px">${t.utama}</span>
          ${t.kecil?`<span class="gr" style="color:#444">${t.kecil}</span>`:''}</div></td>`; }
      if(reh[p]) body+=`<td class="vert" style="background:var(--panel2)"></td>`;
    }
    body+='</tr>';
  });
  return `<div class="row" style="margin-bottom:10px"><div class="seg">
    ${S.hari.map(h=>`<button class="${h===indukHari?'on':''}" onclick="indukHari='${h}';ulang()">${HARI_PENDEK[h]||h}</button>`).join('')}
  </div></div>
  <div class="ttwrap"><table class="tt" style="min-width:900px"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  ${legendSubjek()}`;
}


/* ============================================================
   GOOGLE DRIVE — pangkalan data pada Drive pengguna sendiri
   Skop drive.file: aplikasi hanya nampak fail yang ia cipta.
   ============================================================ */

/* Isi nilai ini untuk menanam Client ID lalai bagi semua sekolah.
   Biarkan kosong jika setiap sekolah mahu memasukkan Client ID sendiri. */



/* ============================================================
   LEMBARAN CETAK
   ============================================================ */
function jadualCetak(mode,id){
  const N=maxWaktu(), m=matriks(mode,id), jm=jalurMasa(), reh=rehatSelepas();
  const pra=S.masa.pra&&S.masa.pra.aktif;
  let cols='<col class="pt-col-day">';
  let head=`<tr><th style="width:40px"></th>`;
  if(pra){
    cols+='<col class="pt-col-period">';
    head+=`<th>0<span class="tm">${esc(S.masa.pra.mula)} - ${hm(mm(S.masa.pra.mula)+num(S.masa.pra.tempoh,10))}</span></th>`;
  }
  for(let p=1;p<=N;p++){
    cols+='<col class="pt-col-period">';
    head+=`<th>${p}<span class="tm">${jm[p-1].mula} - ${jm[p-1].tamat}</span></th>`;
    if(reh[p]){
      const r=masaRehat(p);cols+='<col class="pt-col-rest">';
      head+=`<th class="pt-rest-head">${esc(reh[p].label||'REHAT')}<span class="tm">${r.mula} - ${r.tamat}</span></th>`;
    }
  }
  head+=`</tr>`;
  let body='';
  S.hari.forEach((h,d)=>{
    body+=`<tr><td class="day">${HARI_PENDEK[h]||h.slice(0,3)}</td>`;
    if(pra&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">${esc(S.masa.pra.label)}</td>`;
    for(let p=1;p<=N;p++){
      const c=m[d][p];
      if(c&&!c.mula){ if(reh[p]&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">${esc((reh[p].label||'REHAT'))}</td>`; continue; }
      if(p>waktuHari(h)) body+=`<td style="background:#eee"></td>`;
      else if(!c) body+=`<td></td>`;
      else{
        const t=teksSel(mode,c);
        body+=`<td class="cellv" colspan="${c.len}" style="background:${esc(t.warna)}55">
          <div class="pc">${t.sudut?`<span class="psub">${t.sudut}</span>`:''}
          <span class="pcls" style="font-size:${szTeks(t.utama,true)}px">${t.utama}</span>
          ${t.kecil?`<span class="pgr">${t.kecil}</span>`:''}</div></td>`;
      }
      if(reh[p]&&d===0) body+=`<td class="vert" rowspan="${S.hari.length}">${esc((reh[p].label||'REHAT'))}</td>`;
    }
    body+='</tr>';
  });
  return `<table class="pt"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
function ringkasanGuru(id){
  const slots=(S.jadual&&S.jadual.slots||[]).filter(x=>x.guruId===id);
  const peta={};
  slots.forEach(x=>{ const k=x.subjekId+'|'+x.kelasId; peta[k]=(peta[k]||0)+num(x.panjang,1); });
  const rows=Object.keys(peta).map(k=>{const [sid,kid]=k.split('|');
    return {subjek:kodSubjek(sid),kelas:namaKelas(kid),jum:peta[k],tahap:(kelasById(kid)||{}).tahap||0};});
  rows.sort((a,b)=>a.tahap-b.tahap||a.subjek.localeCompare(b.subjek));
  const ac=acaraUntuk('guru',id).map(a=>({subjek:a.kod,kelas:'Tanpa kelas',jum:num(a.panjang,1),tahap:-1}));
  const semua=ac.concat(rows);
  const jum=semua.reduce((s,r)=>s+r.jum,0);
  return {rows:semua,jum};
}
function ringkasanKelas(id){
  const slots=(S.jadual&&S.jadual.slots||[]).filter(x=>x.kelasId===id);
  const peta={};
  slots.forEach(x=>{ const k=x.subjekId+'|'+x.guruId; peta[k]=(peta[k]||0)+num(x.panjang,1); });
  const rows=Object.keys(peta).map(k=>{const [sid,gid]=k.split('|');
    return {subjek:kodSubjek(sid),kelas:namaGuru(gid),jum:peta[k]};});
  rows.sort((a,b)=>b.jum-a.jum||a.subjek.localeCompare(b.subjek));
  const ac=acaraUntuk('kelas',id).map(a=>({subjek:a.kod,kelas:'—',jum:num(a.panjang,1)}));
  const semua=ac.concat(rows);
  return {rows:semua,jum:semua.reduce((s,r)=>s+r.jum,0)};
}
function tarikhCetak(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}.${m[2]}.${m[1]}`:String(value||'');
}
function tajukCetak(tajuk){
  const text=String(tajuk||'').trim(), tahun=String(S.sekolah.tahun||'').trim();
  return tahun&&!text.includes(tahun)?`${text} ${tahun}`:text;
}
function kelasSaizTajuk(value){
  const L=String(value||'').length;
  return L>42?' sh-title-xs':L>28?' sh-title-sm':'';
}
function kelasSaizRingkasan(value){
  const L=String(value||'').length;
  return L>42?' sum-fit-xs':L>28?' sum-fit-sm':'';
}
function kepalaLembaran(tajuk,subtajuk,kanan){
  const logos=[S.sekolah.logo1,S.sekolah.logo2].filter(Boolean).map(src=>`<img src="${src}" class="sh-logo">`).join('');
  return `<div class="sh-head"><div class="sh-brand">${logos}</div>
    <div class="sh-title">
      <div class="s1">${esc(S.sekolah.nama||'NAMA SEKOLAH')}</div>
      <div class="s2">${esc(tajukCetak(tajuk))}</div>
      <div class="s3${kelasSaizTajuk(subtajuk)}">${esc(subtajuk)}</div>
    </div>
    <div class="sh-meta">${kanan||''}</div>
  </div>`;
}
function kakiLembaran(){
  const t=new Date();
  return `<div class="sh-foot"><span>Jadual waktu terjana: ${t.getDate()}/${t.getMonth()+1}/${t.getFullYear()}</span>
    <span>Sistem Jadual</span></div>`;
}
function tandaTangan(){
  return `<div class="sh-sign">Disahkan Oleh:<div class="nm">${esc(S.sekolah.gb||'')}</div>
    <div style="font-size:10px">${esc(S.sekolah.gbGelaran||'GURU BESAR')}<br>${esc(S.sekolah.nama||'')}</div></div>`;
}
function lembaranGuru(id,padat){
  const g=guruById(id); if(!g) return '';
  const R=ringkasanGuru(id);
  const kelasNya=S.kelas.filter(k=>k.guruKelas===id).map(k=>k.nama).join(', ');
  const rh=padat?'13mm':`min(30mm, calc(158mm / ${S.hari.length}))`;
  return `<div class="sheet ${padat?'compact':''}" style="--rowh:${rh}">
    ${kepalaLembaran(S.sekolah.tajukGuru,g.nama,`${S.sekolah.bermula?`BERMULA ${esc(tarikhCetak(S.sekolah.bermula))}<br><br>`:''}GURU KELAS:<br><span style="font-weight:400">${esc(kelasNya||'—')}</span>`)}
    <div class="sh-body">
      <div class="sh-main">${jadualCetak('guru',id)}</div>
      <div class="sh-side">
        <table class="sum"><thead><tr><th style="width:60px">Subjek</th><th>Kelas</th><th style="width:46px">Jumlah</th></tr></thead>
        <tbody>${R.rows.map(r=>`<tr><td>${esc(r.subjek)}</td><td class="${kelasSaizRingkasan(r.kelas)}">${esc(r.kelas)}</td><td class="c">${r.jum}</td></tr>`).join('')}
        ${Array.from({length:Math.max(0,14-R.rows.length)},()=>`<tr><td>&nbsp;</td><td></td><td></td></tr>`).join('')}
        <tr><td colspan="2" style="text-align:right;font-weight:700">Jumlah Waktu</td><td class="c" style="font-weight:700">${R.jum}</td></tr>
        </tbody></table>
        ${tandaTangan()}
      </div>
    </div>${kakiLembaran()}</div>`;
}
function lembaranKelas(id,padat){
  const k=kelasById(id); if(!k) return '';
  const R=ringkasanKelas(id);
  const rh=padat?'13mm':`min(30mm, calc(158mm / ${S.hari.length}))`;
  return `<div class="sheet ${padat?'compact':''}" style="--rowh:${rh}">
    ${kepalaLembaran(S.sekolah.tajukKelas,k.nama,`${S.sekolah.bermula?`BERMULA ${esc(tarikhCetak(S.sekolah.bermula))}<br><br>`:''}GURU KELAS:<br><span style="font-weight:400">${esc(k.guruKelas?namaGuru(k.guruKelas):'—')}</span>`)}
    <div class="sh-body">
      <div class="sh-main">${jadualCetak('kelas',id)}</div>
      <div class="sh-side">
        <table class="sum"><thead><tr><th style="width:60px">Subjek</th><th>Guru</th><th style="width:46px">Jumlah</th></tr></thead>
        <tbody>${R.rows.map(r=>`<tr><td>${esc(r.subjek)}</td><td class="${kelasSaizRingkasan(r.kelas)}">${esc(r.kelas)}</td><td class="c">${r.jum}</td></tr>`).join('')}
        ${Array.from({length:Math.max(0,14-R.rows.length)},()=>`<tr><td>&nbsp;</td><td></td><td></td></tr>`).join('')}
        <tr><td colspan="2" style="text-align:right;font-weight:700">Jumlah Waktu</td><td class="c" style="font-weight:700">${R.jum}</td></tr>
        </tbody></table>${tandaTangan()}
      </div></div>${kakiLembaran()}</div>`;
}
const HAD_BARIS_INDUK=26;
function potongSenarai(senarai,saiz=HAD_BARIS_INDUK){
  const hasil=[];for(let i=0;i<senarai.length;i+=saiz) hasil.push(senarai.slice(i,i+saiz));return hasil;
}
function halamanInduk(mode){
  const bil=mode==='kelas'?S.kelas.length:S.guru.length;
  return S.hari.length*Math.ceil(bil/HAD_BARIS_INDUK);
}
function lembaranIndukJenis(mode,hari){
  const semua=mode==='kelas'?S.kelas:S.guru;
  const bahagian=potongSenarai(semua);
  return bahagian.map((senarai,indeks)=>lembaranIndukBahagian(mode,hari,senarai,indeks,bahagian.length)).join('');
}
function lembaranIndukKelas(hari){ return lembaranIndukJenis('kelas',hari); }
function lembaranIndukGuru(hari){ return lembaranIndukJenis('guru',hari); }
function lembaranIndukBahagian(mode,hari,senarai,indeks,jumlahBahagian){
  const N=maxWaktu(), jm=jalurMasa(), reh=rehatSelepas(), d=S.hari.indexOf(hari);
  const pra=S.masa.pra&&S.masa.pra.aktif;
  const label=mode==='kelas'?'KELAS':'GURU';
  let cols='<col class="pt-col-master-name">',head=`<tr><th>${label}</th>`;
  if(pra){cols+='<col class="pt-col-period">';head+=`<th>0<span class="tm">${esc(S.masa.pra.mula)} - ${hm(mm(S.masa.pra.mula)+num(S.masa.pra.tempoh,10))}</span></th>`;}
  for(let p=1;p<=N;p++){
    cols+='<col class="pt-col-period">';
    head+=`<th>${p}<span class="tm">${jm[p-1].mula} - ${jm[p-1].tamat}</span></th>`;
    if(reh[p]){const r=masaRehat(p);cols+='<col class="pt-col-rest">';head+=`<th class="pt-rest-head">${esc(reh[p].label||'REHAT')}<span class="tm">${r.mula} - ${r.tamat}</span></th>`;}
  }
  head+='</tr>';
  let body='';
  senarai.forEach((entiti,ri)=>{
    const m=matriks(mode,entiti.id);
    const nama=mode==='kelas'?entiti.nama:(entiti.kod||entiti.nama);
    body+=`<tr><th class="pt-master-name" title="${esc(entiti.nama)}">${esc(nama)}</th>`;
    if(pra) body+=`<td class="pt-master-pre">${esc(S.masa.pra.label||'PENGURUSAN')}</td>`;
    for(let p=1;p<=N;p++){
      const c=m[d][p];
      if(p>waktuHari(hari)) body+='<td class="pt-closed"></td>';
      else if(!c) body+='<td></td>';
      else{
        const t=teksSel(mode,c), kecil=mode==='guru'?t.sudut:t.kecil;
        body+=`<td class="cellv" style="background:${esc(t.warna)}55"><div class="pc pt-master-cell">
          <span class="pcls" style="font-size:${Math.min(11,szTeks(t.utama,true))}px">${t.utama}</span>
          ${kecil?`<span class="pgr">${kecil}</span>`:''}</div></td>`;
      }
      if(reh[p]&&ri===0) body+=`<td class="vert" rowspan="${senarai.length}">${esc(reh[p].label||'REHAT')}</td>`;
    }
    body+='</tr>';
  });
  const rh=Math.max(6,Math.min(16,160/Math.max(1,senarai.length))).toFixed(2)+'mm';
  const jenis=mode==='kelas'?'KELAS':'GURU';
  const bahagianLabel=jumlahBahagian>1?`<br>BAHAGIAN ${indeks+1}/${jumlahBahagian}`:'';
  return `<div class="sheet compact master-sheet" style="--rowh:${rh}">
    ${kepalaLembaran(`JADUAL INDUK ${jenis}`,'HARI '+hari,`${S.sekolah.bermula?`BERMULA ${esc(tarikhCetak(S.sekolah.bermula))}`:''}${bahagianLabel}`)}
    <table class="pt pt-master"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>
    ${kakiLembaran()}</div>`;
}

/* ============================================================
   CETAK
   ============================================================ */
let cetakJenis='guru', cetakPadat=false, cetakPilih=null;
function senaraiJenisCetak(){
  if(cetakJenis==='guru') return S.guru;
  if(cetakJenis==='kelas') return S.kelas;
  if(cetakJenis==='induk-kelas'||cetakJenis==='induk-guru') return S.hari.map(h=>({id:h,nama:h}));
  return [];
}
VIEWS.cetak={t:'Cetak / PDF', r(){
  if(!bilJadual()) return `<div class="card"><div class="alert warn">Belum ada jadual untuk dicetak.</div>
    <button class="btn pri" onclick="go('jana')">✨ Jana Jadual</button></div>`;
  const senarai=senaraiJenisCetak();
  if(cetakPilih===null) cetakPilih=new Set(senarai.map(x=>x.id));
  const indukKelas=halamanInduk('kelas'), indukGuru=halamanInduk('guru');
  const jumSemua=S.guru.length+S.kelas.length+indukKelas+indukGuru;
  return `<div class="card noprint"><h3>Cetak Jadual</h3>
    <p class="hint">Empat format jadual mengikut susun atur aSc. Gunakan <b>A4 landskap</b> dan pilih “Simpan sebagai PDF”. Hidupkan <b>Grafik latar belakang</b> untuk mencetak warna subjek.</p>
    <div class="row">
      <div class="seg print-type-tabs">
        <button class="${cetakJenis==='guru'?'on':''}" onclick="cetakJenis='guru';cetakPilih=null;ulang()">Jadual Guru</button>
        <button class="${cetakJenis==='kelas'?'on':''}" onclick="cetakJenis='kelas';cetakPilih=null;ulang()">Jadual Kelas</button>
        <button class="${cetakJenis==='induk-kelas'?'on':''}" onclick="cetakJenis='induk-kelas';cetakPilih=null;ulang()">Jadual Induk Kelas</button>
        <button class="${cetakJenis==='induk-guru'?'on':''}" onclick="cetakJenis='induk-guru';cetakPilih=null;ulang()">Jadual Induk Guru</button>
        <button class="${cetakJenis==='semua'?'on':''}" onclick="cetakJenis='semua';cetakPilih=null;ulang()">Semua Sekali</button>
      </div>
      <label class="chk"><input type="checkbox" ${cetakPadat?'checked':''} onchange="cetakPadat=this.checked;ulang()"> Padat (sesuai jika banyak waktu)</label>
      <div class="right row">
        ${cetakJenis!=='semua'?`<button class="btn" onclick="pilihSemuaCetak(true)">Pilih semua</button>
        <button class="btn" onclick="pilihSemuaCetak(false)">Kosongkan</button>`:''}
        <button class="btn pri" onclick="window.print()">🖨️ Cetak / Simpan PDF</button>
      </div>
    </div>
    ${cetakJenis==='semua'
      ? `<div class="alert info" style="margin-top:12px">Akan mencetak <b>${jumSemua} muka surat</b>: ${S.guru.length} jadual guru + ${S.kelas.length} jadual kelas + ${indukKelas} jadual induk kelas + ${indukGuru} jadual induk guru.</div>`
      : `<div class="grid g4" style="margin-top:12px">
      ${senarai.map(x=>`<label class="chk" style="border:1px solid var(--line);border-radius:8px;padding:6px 10px;background:var(--panel2)">
        <input type="checkbox" class="ckC" value="${esc(x.id)}" ${cetakPilih.has(x.id)?'checked':''}
        onchange="this.checked?cetakPilih.add(this.value):cetakPilih.delete(this.value);ulangCetakPratonton()"> ${esc(x.nama)}</label>`).join('')}
    </div>`}
  </div>
  <div id="cetakArea">${pratontonCetak()}</div>`;
}};
function pilihSemuaCetak(on){
  const senarai=senaraiJenisCetak();
  cetakPilih=new Set(on?senarai.map(x=>x.id):[]); ulang();
}
function ulangCetakPratonton(){ $('#cetakArea').innerHTML=pratontonCetak(); }
function pratontonCetak(){
  if(cetakJenis==='semua')
    return S.guru.map(g=>lembaranGuru(g.id,cetakPadat)).join('')
         + S.kelas.map(k=>lembaranKelas(k.id,cetakPadat)).join('')
         + S.hari.map(lembaranIndukKelas).join('')
         + S.hari.map(lembaranIndukGuru).join('');
  const ids=Array.from(cetakPilih||[]);
  if(!ids.length) return `<div class="card noprint"><div class="empty">Tiada pilihan.</div></div>`;
  if(cetakJenis==='guru')  return S.guru.filter(g=>cetakPilih.has(g.id)).map(g=>lembaranGuru(g.id,cetakPadat)).join('');
  if(cetakJenis==='kelas') return S.kelas.filter(k=>cetakPilih.has(k.id)).map(k=>lembaranKelas(k.id,cetakPadat)).join('');
  if(cetakJenis==='induk-kelas') return S.hari.filter(h=>cetakPilih.has(h)).map(lembaranIndukKelas).join('');
  return S.hari.filter(h=>cetakPilih.has(h)).map(lembaranIndukGuru).join('');
}

/* ============================================================
   DATA & SANDARAN
   ============================================================ */
VIEWS.data={t:'Data & Sandaran', r(){
  return `<div class="card"><h3>Sandaran</h3>
    <p class="hint">Data disimpan dalam pelayar peranti ini sahaja. Eksport fail JSON sebagai salinan keselamatan atau untuk memindahkan ke peranti lain.</p>
    <div class="row">
      <button class="btn pri" onclick="eksportJSON()">⬇️ Eksport JSON</button>
      <button class="btn" onclick="fileIn.click()">⬆️ Import fail JSON</button>
      <button class="btn" onclick="eksportCSV()">📄 Eksport jadual (CSV)</button>
      <button class="btn" onclick="salinJSON()">📋 Salin JSON</button>
      <button class="btn" onclick="tampalJSON()">📥 Tampal JSON</button>
      <button class="btn" onclick="eksportPaparan()">📄 Fail Paparan Guru</button>
    </div>
    ${memOnly?`<div class="alert warn" style="margin-top:12px">Pelayar ini tidak membenarkan simpanan tempatan (mungkin mod peribadi atau pratonton dalam apl). Data hanya kekal selagi tab dibuka — sila <b>Eksport JSON</b> sebelum menutup, dan buka fail ini terus dalam pelayar (Chrome/Safari) untuk simpanan kekal.</div>`:
      `<div class="alert ok" style="margin-top:12px">✅ Simpanan pelayar berfungsi. Data anda kekal walaupun tab ditutup.</div>`}
  </div>
  <div class="card"><h3>Set Semula</h3>
    <div class="row">
      <button class="btn" onclick="muatContoh()">📦 Muatkan data contoh</button>
      <button class="btn dgr" onclick="ask('Padam jadual yang dijana sahaja (data asas dikekalkan)?',()=>{ubah(()=>S.jadual=null);ulang();toast('Jadual dipadam')})">Padam jadual sahaja</button>
      <button class="btn dgr" onclick="ask('Padam <b>SEMUA</b> data? Tindakan ini tidak boleh dibatalkan.',()=>{S=kosong();simpan();go('dash');toast('Semua data dipadam')})">Padam semua data</button>
    </div></div>`;
}};
/** Muat turun fail — guna API hos jika ada (versi web), jika tidak guna pautan biasa */
async function muatTurun(nama,kandungan,mime){
  try{
    if(window.claude&&typeof window.claude.use==='function'){
      const dl=await window.claude.use('downloads');
      if(dl){ await dl.save({filename:nama,data:kandungan}); toast('Fail disimpan'); return; }
    }
  }catch(e){
    if(e&&e.code==='declined') return;
  }
  const blob=new Blob([kandungan],{type:mime||'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000); toast('Fail dimuat turun');
}
/* ---------- Fail paparan untuk guru (baca sahaja) ---------- */
function dataPaparan(){
  const t=new Date();
  return {
    sekolah:S.sekolah, masa:S.masa, hari:S.hari,
    subjek:S.subjek.map(s=>({id:s.id,kod:s.kod,nama:s.nama,warna:s.warna})),
    kelas:S.kelas.map(k=>({id:k.id,nama:k.nama,tahap:k.tahap,guruKelas:k.guruKelas})),
    guru:S.guru.map(g=>({id:g.id,nama:g.nama,gelaran:g.gelaran,kod:g.kod})),
    acara:S.acara||[],
    slots:(S.jadual&&S.jadual.slots||[]).map(x=>({kelasId:x.kelasId,subjekId:x.subjekId,guruId:x.guruId,
      hari:x.hari,mula:x.mula,panjang:x.panjang})),
    tarikh:t.getDate()+'/'+(t.getMonth()+1)+'/'+t.getFullYear()
  };
}
function binaFailPaparan(){
  const tpl=document.getElementById('tplPaparan').textContent.split('<\\/script>').join('<\/script>');
  const json=JSON.stringify(dataPaparan()).split('<').join('\\u003c');
  return tpl.split('__DATA__').join(json);
}
function eksportPaparan(){
  if(!bilJadual()){ toast('Tiada jadual untuk dieksport','bad'); return; }
  const nama='jadual-paparan-'+(S.sekolah.nama||'sekolah').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-'+S.sekolah.tahun+'.html';
  muatTurun(nama,binaFailPaparan(),'text/html;charset=utf-8');
}
function bukaPaparan(){
  if(!bilJadual()){ toast('Tiada jadual','bad'); return; }
  const w=window.open('','_blank');
  if(!w){ toast('Pelayar menyekat tetingkap baharu — guna butang Eksport sebaliknya','warn',4000); return; }
  w.document.open(); w.document.write(binaFailPaparan()); w.document.close();
}

function eksportJSON(){
  const nama='jadual-'+(S.sekolah.nama||'sekolah').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-'+S.sekolah.tahun+'.json';
  muatTurun(nama,JSON.stringify(S,null,2),'application/json');
}
function salinJSON(){
  const t=JSON.stringify(S);
  $('#dlgBody').innerHTML=`<h3>Salin data (JSON)</h3>
    <p class="hint">Salin teks di bawah dan simpan dalam nota / e-mel sebagai sandaran. Boleh ditampal semula melalui “Tampal JSON”.</p>
    <textarea id="cjTxt" style="min-height:200px;font-family:monospace;font-size:11px">${esc(t)}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn" onclick="dlg.close()">Tutup</button>
      <button class="btn pri" onclick="(async()=>{try{await navigator.clipboard.writeText($('#cjTxt').value);toast('Disalin')}catch(e){$('#cjTxt').select();document.execCommand('copy');toast('Disalin')}})()">📋 Salin</button></div>`;
  $('#dlg').showModal();
}
function tampalJSON(){
  $('#dlgBody').innerHTML=`<h3>Tampal data (JSON)</h3>
    <p class="hint">Tampal kandungan fail sandaran JSON di sini. Data semasa akan diganti.</p>
    <textarea id="tjTxt" style="min-height:200px;font-family:monospace;font-size:11px" placeholder='{"v":3,...}'></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn" onclick="dlg.close()">Batal</button>
      <button class="btn pri" onclick="doTampalJSON()">Import</button></div>`;
  $('#dlg').showModal();
}
function doTampalJSON(){
  try{ const o=JSON.parse($('#tjTxt').value);
    if(!o.subjek||!o.kelas) throw new Error('Format tidak dikenali');
    S=Object.assign(kosong(),o);
    S.masa=Object.assign(kosong().masa,o.masa||{}); S.kekangan=Object.assign(kosong().kekangan,o.kekangan||{});
    S.sekolah=Object.assign(kosong().sekolah,o.sekolah||{});
    simpan(); $('#dlg').close(); go('dash'); toast('Data diimport');
  }catch(e){ toast('Gagal: '+e.message,'bad'); }
}
function eksportCSV(){
  if(!bilJadual()){toast('Tiada jadual','bad');return;}
  const baris=[['Hari','Waktu','Kelas','Subjek','Guru','Panjang']];
  S.jadual.slots.slice().sort((a,b)=>S.hari.indexOf(a.hari)-S.hari.indexOf(b.hari)||a.mula-b.mula)
    .forEach(x=>baris.push([x.hari,x.mula,namaKelas(x.kelasId),kodSubjek(x.subjekId),namaGuru(x.guruId),x.panjang]));
  const csv=baris.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  muatTurun('jadual.csv','﻿'+csv,'text/csv;charset=utf-8');
}
$('#fileIn').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ const o=JSON.parse(r.result);
      if(!o.subjek||!o.kelas) throw new Error('Format tidak dikenali');
      S=Object.assign(kosong(),o);
      S.masa=Object.assign(kosong().masa,o.masa||{}); S.kekangan=Object.assign(kosong().kekangan,o.kekangan||{});
      S.sekolah=Object.assign(kosong().sekolah,o.sekolah||{});
      simpan(); go('dash'); toast('Data diimport');
    }catch(err){ toast('Gagal import: '+err.message,'bad'); } };
  r.readAsText(f); e.target.value='';
};

/* ============================================================
   PANDUAN
   ============================================================ */
VIEWS.bantuan={t:'Panduan', r(){
  return `<div class="card"><h3>Panduan Ringkas</h3>
  <h4>1. Susunan kerja</h4>
  <p>Tetapan Sekolah → Subjek → Kelas → Guru → Peruntukan Waktu → Agihan Guru → Slot Tetap → Kekangan → Jana.</p>
  <h4>2. Peruntukan waktu vs agihan guru</h4>
  <p><b>Peruntukan Waktu</b> menetapkan bilangan waktu seminggu bagi setiap subjek mengikut <b>tahun</b> — semua kelas dalam tahun sama mewarisinya. <b>Agihan Guru</b> pula menetapkan siapa mengajar apa di kelas mana, dan boleh mengubah bilangan waktu untuk kelas tertentu.</p>
  <h4>3. Kenapa ada blok gagal diletakkan?</h4>
  <p>Biasanya kerana kapasiti tidak mencukupi atau kekangan terlalu ketat. Cuba: kurangkan waktu subjek, naikkan <i>maks waktu berturut</i>, naikkan <i>maks subjek sehari</i>, tambah bilangan waktu sehari, atau agihkan semula guru supaya beban lebih rata.</p>
  <h4>4. Kunci blok 🔒</h4>
  <p>Dalam <b>Lihat &amp; Edit</b>, klik blok dua kali untuk membuka menu dan tandakan <b>Kunci</b>. Blok berkunci akan kekal di tempatnya apabila anda menjana semula.</p>
  <h4>5. Cetak PDF</h4>
  <p>Buka <b>Cetak / PDF</b>, pilih guru/kelas/hari, tekan <b>Cetak</b>. Dalam dialog pelayar pilih <i>Simpan sebagai PDF</i>, saiz <b>A4</b>, orientasi <b>Landskap</b>, dan hidupkan <i>Grafik latar belakang</i>.</p>
  <h4>6. Simpanan data</h4>
  <p>Data disimpan dalam pelayar peranti ini. Untuk berpindah peranti atau membuat salinan, guna <b>Eksport JSON</b> dan <b>Import JSON</b> di menu Data &amp; Sandaran.</p>
  <h4>7. Kemudahan terhad</h4>
  <p>Isikan medan <b>Kemudahan</b> pada subjek (cth. <code>PADANG</code> untuk PJ), kemudian tetapkan berapa kelas boleh menggunakannya serentak di menu <b>Kekangan</b>.</p>
  </div>

  <div class="card"><h3>📤 Mengedarkan Jadual Kepada Guru</h3>
  <div class="alert info"><b>Penting:</b> data aplikasi ini disimpan dalam pelayar <b>setiap peranti secara berasingan</b>. Jika 30 guru membuka pautan aplikasi yang sama, setiap seorang mendapat aplikasi kosong — bukan jadual sekolah anda. Aplikasi ini untuk <b>penyelaras jadual</b>; guru lain hanya perlu <b>melihat</b> jadual masing-masing.</div>
  <h4>Cara disyorkan</h4>
  <ol style="margin:0 0 10px 18px;line-height:1.7">
    <li>Buka <b>Cetak / PDF</b> → <b>Eksport Fail Paparan Guru</b>. Anda dapat satu fail HTML dengan jadual siap terbenam.</li>
    <li>Muat naik fail itu ke laman web sekolah / Google Drive / hosting percuma, atau hantar terus dalam kumpulan WhatsApp guru.</li>
    <li>Guru buka fail → pilih nama sendiri → jadual keluar → tekan Cetak untuk simpan PDF.</li>
  </ol>
  <h4>Pilihan hosting percuma</h4>
  <div class="tblwrap"><table class="dt"><thead><tr><th style="width:150px">Perkhidmatan</th><th>Cara</th><th style="width:110px">Sesuai bila</th></tr></thead><tbody>
    <tr><td><b>Netlify Drop</b><br><span class="muted">app.netlify.com/drop</span></td>
      <td>Buka laman, seret fail HTML masuk. URL terus terhasil dalam beberapa saat. Untuk mengekalkan URL, daftar akaun percuma.</td><td>Paling cepat</td></tr>
    <tr><td><b>GitHub Pages</b><br><span class="muted">github.com</span></td>
      <td>Cipta repositori baharu → muat naik fail sebagai <code>index.html</code> → Settings → Pages → pilih branch <code>main</code>. URL: <code>namaanda.github.io/nama-repo</code>.</td><td>Kekal jangka panjang</td></tr>
    <tr><td><b>Google Apps Script</b><br><span class="muted">script.google.com</span></td>
      <td>Lihat kod pembalut di bawah. Deploy sebagai Web app, akses "Anyone with the link".</td><td>Kekal dalam ekosistem Google sekolah</td></tr>
    <tr><td><b>Google Drive</b></td>
      <td>Muat naik fail, kongsi pautan. Guru perlu <b>muat turun</b> dahulu sebelum buka (Drive tidak memaparkan HTML terus).</td><td>Paling mudah, tiada akaun baharu</td></tr>
  </tbody></table></div>
  <h4 style="margin-top:14px">Kod Google Apps Script (salin-tampal)</h4>
  <p class="hint">Fail <code>Code.gs</code> — namakan fail HTML anda sebagai <code>paparan.html</code> dalam projek Apps Script yang sama.</p>
  <pre style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:12.5px"><code>function doGet() {
  return HtmlService.createHtmlOutputFromFile('paparan')
    .setTitle('Jadual Waktu Sekolah')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}</code></pre>
  <p class="muted">Langkah: script.google.com → New project → tampal kod di atas → Fail &gt; New &gt; HTML file bernama <code>paparan</code> → tampal kandungan fail paparan → Deploy &gt; New deployment &gt; Web app → Execute as: Me, Who has access: Anyone with the link.</p>
  </div>`;
}};

/* ============================================================
   PERMULAAN
   ============================================================ */
$$('#nav .navbtn').forEach(b=>b.onclick=()=>go(b.dataset.v));
$('#btnMenu').onclick=()=>{
  const s=$('#side'); s.classList.add('open');
  const sc=document.createElement('div'); sc.className='scrim'; sc.id='scrim';
  sc.onclick=()=>{s.classList.remove('open');sc.remove();};
  document.getElementById("builderRoot").appendChild(sc);
};
$('#btnTheme').onclick=()=>{
  const cur=document.getElementById("builderRoot").getAttribute('data-theme');
  const next=cur==='dark'?'light':cur==='light'?'':'dark';
  if(next) document.getElementById("builderRoot").setAttribute('data-theme',next);
  else document.getElementById("builderRoot").removeAttribute('data-theme');
  try{localStorage.setItem('janajadual.tema',next);}catch(e){}
};
$('#btnSaveNow').onclick=()=>{simpan();toast(memOnly?'Tidak dapat menyimpan dalam pelayar':'Data disimpan',memOnly?'warn':'ok');};
document.getElementById("builderRoot").setAttribute('data-theme','light');

VIEWS.dash = {t:'Ruang bina jadual', r(){
  const st = stat();
  const steps = [
    ['01','Sekolah & masa','Hari persekolahan, waktu dan rehat.','tetapan',Boolean(S.sekolah.nama)],
    ['02','Subjek & kelas',`${S.subjek.length} subjek · ${S.kelas.length} kelas. Mulakan dengan subjek, kemudian kelas.`, 'subjek',Boolean(S.subjek.length && S.kelas.length)],
    ['03','Guru & ketersediaan',`${S.guru.length} guru. Tetapkan had mengajar dan waktu tidak tersedia.`, 'guru',Boolean(S.guru.length)],
    ['04','Peruntukan & agihan',`${st.jumWaktu} waktu seminggu · ${st.tanpaGuru} belum mempunyai guru.`, 'peruntukan',st.jumWaktu > 0 && st.tanpaGuru === 0],
    ['05','Slot tetap & kekangan','Tetapkan perhimpunan, aktiviti dan syarat penjanaan.', 'acara',false],
    ['06','Jana, semak & aktifkan',`${bilJadual()} blok dijadualkan. Semak sebelum digunakan untuk relief.`, 'jana',bilJadual() > 0]
  ];
  return `<div class="card"><p class="eyebrow">PEMBINA JADUAL SEKOLAH</p><h2>Satu aliran, dari data hingga jadual siap.</h2><p class="hint">Ikuti langkah di bawah atau pilih bahagian terus daripada menu. Tekan Simpan draf ke Sheets untuk menyimpan semua persediaan dalam fail Sistem Jadual sekolah.</p>
    <div class="build-status"><div><b>${S.guru.length}</b><span>Guru</span></div><div><b>${S.kelas.length}</b><span>Kelas</span></div><div><b>${S.subjek.length}</b><span>Subjek</span></div><div><b>${bilJadual()}</b><span>Blok jadual</span></div></div>
    <div class="build-grid">${steps.map(([n,t,d,v,ready])=>`<button class="build-step" onclick="go('${v}')"><i>${ready?'✓':n}</i><b>${t}</b><span>${d}</span><small>${ready?'Semak / ubah':'Buka langkah'} →</small></button>`).join('')}</div>
    <div class="row" style="margin-top:18px"><button class="btn" onclick="go('kelas')">Urus kelas</button><button class="btn" onclick="go('agihan')">Agihan guru</button><button class="btn" onclick="go('kekangan')">Kekangan</button><button class="btn" onclick="go('data')">Pulihkan / sandarkan data</button><button class="btn pri" onclick="go('lihat')">Lihat & edit jadual →</button></div></div>`;
}};

VIEWS.data={t:'Sandaran',r(){return '<div class="card"><h3>Salinan keselamatan</h3><p>Data utama berada dalam satu Google Sheets sekolah. Gunakan JSON hanya untuk sandaran atau memindahkan data pembina lama.</p><div class="row"><button class="btn" onclick="eksportJSON()">Muat turun sandaran JSON</button><button class="btn" onclick="fileIn.click()">Import sandaran lama</button></div></div>';}};
VIEWS.bantuan={t:'Panduan ringkas',r(){return '<div class="card"><h3>Bina jadual dalam 4 langkah</h3><ol><li>Isi sekolah, masa, subjek, kelas dan guru.</li><li>Tetapkan peruntukan waktu, agihan guru dan slot tetap.</li><li>Jana jadual, semak pertembungan, kemudian cetak jadual guru atau kelas.</li><li>Simpan draf ke Sheets. Pilih Gunakan untuk relief apabila jadual sudah siap.</li></ol><p>PDF aSc boleh diimport terus daripada halaman Jadual. Nama tanpa padanan diabaikan dan boleh dipilih secara manual.</p></div>';}};
const adaData=muat();
simpan(true);
go('dash');


window.jadualBuilder = {
  setState(state) {S=Object.assign(kosong(),clone(state));S.masa=Object.assign(kosong().masa,state.masa||{});ulang();},
  clear() {S=kosong();$('#content').innerHTML='';},
  getState: () => clone(S),
  validate: () => semakJadual(),
  times: () => jalurMasa(),
  go,
  // Guru gantian (Personel MySTEP / Guru Praktikal) membawa pautan gantian mereka ke dalam pembina,
  // supaya "Jana jadual gantian" boleh mengagih kelas yang diambil sebagai jadual mereka sendiri.
  mergeTeachers(teachers) {
    const normalize = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let count = 0;
    teachers.filter(t => t.active).forEach(t => {
      let g = S.guru.find(g => g.directoryId === t.id || normalize(g.nama) === normalize(t.name));
      if (!g) { g = {id:uid(),gelaran:'',maxHari:8,tidakAda:[]}; S.guru.push(g); count++; }
      Object.assign(g, {directoryId:t.id,nama:t.name,kod:t.shortName,jawatan:t.position,coversJson:t.coversJson||''});
    });
    simpan(true); ulang(); return teachers.filter(t => t.active).length;
  },
  seedSchool() { if (!S.sekolah.nama) S.sekolah.nama='SEKOLAH KEBANGSAAN PAYA REDAN'; simpan(true); ulang(); }
};
// ===== Gantian tetap (MySTEP / guru praktikal) =====
// Membaca pautan gantian yang disimpan pada profil guru dan menyalin agihan guru yang diganti
// kepada guru gantian, supaya "Jana Jadual" boleh menghasilkan jadual mereka sendiri. Ia
// ditandakan dariGantian supaya penyalinan berulang tidak berganda.
function coverListBuilder(raw){
  if(!raw) return [];
  let list=raw;
  if(typeof raw==='string'){ try{ list=JSON.parse(raw); }catch(e){ return []; } }
  if(!Array.isArray(list)) return [];
  return list.filter(e=>e&&e.teacherId).map(e=>({
    teacherId:String(e.teacherId),
    subjects:(Array.isArray(e.subjects)?e.subjects:String(e.subjects||'').split(',')).map(s=>String(s).trim().toUpperCase()).filter(Boolean),
  }));
}
function pautanGantian(){
  const links=[];
  S.guru.forEach(g=>{
    coverListBuilder(g.coversJson).forEach(entry=>{
      const diganti=S.guru.find(x=>x.directoryId===entry.teacherId||x.id===entry.teacherId);
      if(diganti&&diganti.id!==g.id) links.push({guru:g,diganti,subjects:entry.subjects});
    });
  });
  return links;
}
function janaJadualGantian(){
  const links=pautanGantian();
  if(!links.length) return {added:0,skipped:0,total:0};
  let added=0,skipped=0,total=0;
  links.forEach(link=>{
    S.agihan.filter(a=>a.guruId===link.diganti.id||(a.pairGuruIds||[]).includes(link.diganti.id)).forEach(a=>{
      const subjek=subjekById(a.subjekId);
      const nama=String((subjek&&(subjek.nama||subjek.kod))||'').toUpperCase();
      if(link.subjects.length&&!link.subjects.includes(nama)) return;
      total++;
      if(S.agihan.some(x=>x.guruId===link.guru.id&&x.kelasId===a.kelasId&&x.subjekId===a.subjekId)){ skipped++; return; }
      S.agihan.push({id:uid(),kelasId:a.kelasId,subjekId:a.subjekId,guruId:link.guru.id,pairGuruIds:[],waktu:'',ganda:0,dariGantian:true,gantiGuruId:link.diganti.id});
      added++;
    });
  });
  simpan(true); ulang();
  return {added,skipped,total};
}
function janaJadualGantianUI(){
  const pautan=pautanGantian();
  if(!pautan.length) return toast('Tiada guru gantian. Tetapkan "Menggantikan guru" pada kad guru MySTEP atau praktikal dahulu.','warn',5200);
  const hasil=janaJadualGantian();
  if(!hasil.added) return toast(`Tiada agihan baharu: ${hasil.total} waktu diambil, ${hasil.skipped} sudah wujud bagi guru gantian.`,'warn',5600);
  toast(`${hasil.added} agihan ditambah untuk guru gantian${hasil.skipped?` (${hasil.skipped} sudah wujud)`:''}. Tekan Jana Jadual untuk menyusun.`,'ok',6000);
}

document.dispatchEvent(new CustomEvent('builder-ready'));
