import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');

// isiTinggiCetak_, kemasSelCetak_ dan KEMAS_CETAK_ ialah unit yang berdiri sendiri (hanya bergantung
// kepada getComputedStyle global), jadi ia boleh dijalankan terus di atas DOM tiruan yang mengukur
// geometri sebenar - bukan sekadar semak rentetan sumber seperti ujian lain dalam fail ini.
const start = source.indexOf('const KEMAS_CETAK_=[');
const end = source.indexOf('async function eksportPdfJadual(');
const slice = source.slice(start, end);

function makeStyleReader(paddings) {
  return (el) => {
    if (el.__isSheetVar) return { getPropertyValue: (name) => el.__vars[name] || '' };
    if (el.__isText) return { fontSize: el.style.fontSize || el.__fsAsal + 'px' };
    return paddings;
  };
}

function fakeTr(cells) {
  return { style: {}, cells };
}
function fakeTd(height) {
  return { style: {}, rowSpan: 1, getBoundingClientRect: () => ({ height }) };
}

test('a 23-row master timetable is not forced past the sheet height it must fit on one A4 page', () => {
  // Geometri hampiri helaian A4 sebenar: sheet 767px tinggi, padding 12px atas/bawah, kepala 104px,
  // kaki 25px, kepala jadual (thead) 96px - baki ruang ~514px untuk 23 baris guru.
  const rows = 23;
  const trs = [];
  for (let i = 0; i < rows; i++) trs.push(fakeTr([fakeTd(0), fakeTd(0)]));
  let tableHeight = 0;
  const table = {
    tHead: { getBoundingClientRect: () => ({ height: 96 }) },
    tBodies: [{ rows: trs }],
    style: {},
    getBoundingClientRect: () => ({ height: tableHeight }),
  };
  Object.defineProperty(table.style, 'height', {
    set(v) { tableHeight = parseFloat(v); },
    get() { return tableHeight + 'px'; },
  });
  const sheet = {
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ height: 767 }),
    querySelector: (sel) => (sel === '.sh-head' ? { getBoundingClientRect: () => ({ height: 104 }) }
      : sel === '.sh-foot' ? { getBoundingClientRect: () => ({ height: 25 }) } : null),
    querySelectorAll: (sel) => (sel === 'table.pt,table.pt-master' ? [table] : []),
  };
  const root = { querySelectorAll: (sel) => (sel === '#cetakArea .sheet, .sheet' ? [sheet] : []) };
  const context = {
    document: root,
    window: { addEventListener() {} },
    getComputedStyle: (el) => (el === sheet ? { paddingTop: '12px', paddingBottom: '12px' } : {}),
    console,
  };
  vm.runInNewContext(slice, context);
  context.isiTinggiCetak_(root);

  const availableForRows = 767 - 24 /* padding */ - 104 /* head */ - 25 /* foot */; // 614
  const contentBudget = availableForRows - 96 /* thead */; // 518
  assert.ok(tableHeight <= availableForRows, `master table (${tableHeight}px) must fit inside the sheet's content box (${availableForRows}px) so it never spills onto a second A4 page`);
  // The old code forced a 38px floor per row: 96 + 38*23 = 970px, which blew past the 614px budget.
  assert.ok(96 + 38 * rows > availableForRows, 'sanity: the old fixed 38px floor really would have overflowed this case');
  assert.ok(tableHeight <= contentBudget + 96 + 3, 'row heights must be computed from the real available space, not a fixed minimum');
});

test('kemasSelCetak_ does not shrink a cell whose content already fits its real (measured) row box', () => {
  // Replays the audit's concrete numbers: a row genuinely 105px tall, whose real "fits fine" content
  // is 100px, must not be shrunk just because a stale --pt-row default (84px) says otherwise.
  const textEl = { __isText: true, style: {}, dataset: {}, __fsAsal: 12 };
  const pc = {
    scrollWidth: 60,
    scrollHeight: 100,
    clientWidth: 120,
    clientHeight: 105,
    querySelectorAll: () => [textEl],
  };
  const cell = {
    getBoundingClientRect: () => ({ width: 120, height: 105 }),
    querySelector: (sel) => (sel === '.pc' ? pc : null),
  };
  const sheetVar = { __isSheetVar: true, __vars: { '--pt-row': '84px' } };
  const root = {
    querySelectorAll: (sel) => (sel === 'table.pt td.cellv' ? [cell] : []),
  };
  const context = {
    document: root,
    window: { addEventListener() {} },
    getComputedStyle: makeStyleReader({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' }),
    console,
  };
  vm.runInNewContext(slice, context);
  context.kemasSelCetak_(root);
  assert.equal(textEl.style.fontSize, '12.00px', 'content that fits its real row box must be left at its original size (k=1), not shrunk');
});

test('kemasSelCetak_ is idempotent: a second pass on the same DOM does not shrink the font further', () => {
  const textEl = { __isText: true, style: {}, dataset: {}, __fsAsal: 20 };
  const cell = {
    getBoundingClientRect: () => ({ width: 250, height: 300 }),
    querySelector: (sel) => (sel === '.pc' ? pc : null),
  };
  // Content genuinely needs to shrink to fit its width; scrollWidth/Height scale with the current
  // actual font size, the way a real browser reflows text - unlike getBoundingClientRect().height
  // on a box with CSS height:100%, which never changes no matter how small the font gets.
  const pc = {
    querySelectorAll: () => [textEl],
    clientWidth: 250,
    clientHeight: 300,
    get scrollWidth() { return 15 * parseFloat(textEl.style.fontSize || textEl.__fsAsal); },
    get scrollHeight() { return 50; },
  };
  const root = { querySelectorAll: (sel) => (sel === 'table.pt td.cellv' ? [cell] : []) };
  const context = {
    document: root,
    window: { addEventListener() {} },
    getComputedStyle: makeStyleReader({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' }),
    console,
  };
  vm.runInNewContext(slice, context);
  context.kemasSelCetak_(root);
  const afterFirst = textEl.style.fontSize;
  assert.notEqual(afterFirst, '20.00px', 'sanity: this scenario must actually need a shrink');
  context.kemasSelCetak_(root);
  assert.equal(textEl.style.fontSize, afterFirst, 'a second fit pass on unchanged content must not shrink the font again');
});

function fakeRect(getHeight) { return { getBoundingClientRect: () => ({ height: getHeight() }) }; }
function fakeHeightStyle() {
  const state = { value: 0, wasSet: false };
  const style = {};
  Object.defineProperty(style, 'height', {
    set(v) { state.wasSet = true; state.value = parseFloat(v); },
    get() { return state.value + 'px'; },
  });
  return { style, state };
}

// .sh-body{display:flex;align-items:stretch} meregangkan .sh-main dan .sh-side kepada tinggi yang
// sama; jika table.sum (ringkasan sisi) dibiar tumbuh mengikut kandungan (tiada had), ia menarik
// seluruh helaian melepasi 767px apabila baris ringkasan lebih daripada templat biasa (~14 baris) -
// contoh nyata: subjek yang diajar >1 guru merentasi hari sebelum ringkasanKelas_ digabung semula.
test('the side summary table (table.sum) is height-fitted so it cannot stretch the sheet past one A4 page', () => {
  const rows = 20;
  const sumTrs = [];
  for (let i = 0; i < rows; i++) sumTrs.push(fakeTr([fakeTd(0), fakeTd(0), fakeTd(0)]));
  const sumHeight = fakeHeightStyle();
  const shSign = fakeRect(() => 60);
  const shSide = { querySelector: (sel) => (sel === '.sh-sign' ? shSign : null) };
  const sumTable = {
    tHead: fakeRect(() => 24),
    tBodies: [{ rows: sumTrs }],
    style: sumHeight.style,
    getBoundingClientRect: () => ({ height: sumHeight.state.value }),
    closest: (sel) => (sel === '.sh-side' ? shSide : null),
    // Pemampatan fon ringkasan (mampatRingkasanCetak_) mempunyai ujiannya sendiri
    // (tests/print-summary-compress.test.mjs); di sini tiada sel tiruan, jadi ia tiada kesan.
    querySelectorAll: () => [],
  };

  const mainTrs = [fakeTr([fakeTd(0)]), fakeTr([fakeTd(0)])];
  const mainHeight = fakeHeightStyle();
  const mainTable = {
    tHead: fakeRect(() => 40),
    tBodies: [{ rows: mainTrs }],
    style: mainHeight.style,
    getBoundingClientRect: () => ({ height: mainHeight.state.value }),
  };

  const sheet = {
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ height: 767 }),
    querySelector: (sel) => (sel === '.sh-head' ? fakeRect(() => 104) : sel === '.sh-foot' ? fakeRect(() => 21) : null),
    querySelectorAll: (sel) => (sel === 'table.pt,table.pt-master' ? [mainTable] : sel === 'table.sum' ? [sumTable] : []),
  };
  const root = { querySelectorAll: (sel) => (sel === '#cetakArea .sheet, .sheet' ? [sheet] : []) };
  const context = {
    document: root,
    window: { addEventListener() {} },
    getComputedStyle: (el) => (el === sheet ? { paddingTop: '12px', paddingBottom: '12px' } : {}),
    console,
  };
  vm.runInNewContext(slice, context);
  context.isiTinggiCetak_(root);

  const ruangUtama = 767 - 24 - 104 - 21; // 618
  // Bajet table.sum ialah tinggi PENUH (termasuk thead-nya sendiri) selepas menolak tandatangan -
  // tbl.style.height yang diukur (sumHeight.state.value) turut termasuk thead, jadi kedua-duanya
  // mesti dibandingkan dalam kategori yang sama (penuh lawan penuh), bukan penuh lawan baris-sahaja.
  const budgetSumPenuh = ruangUtama - 60 /* tandatangan */; // 558 (termasuk thead 24)
  assert.equal(sumHeight.state.wasSet, true, 'table.sum must be height-fitted, not left to grow freely with its content');
  assert.ok(sumHeight.state.value <= budgetSumPenuh + 3, `table.sum (${sumHeight.state.value}px) must fit its allotted space (${budgetSumPenuh}px) instead of stretching the sheet past 767px`);
});
