/* Pembalut pekerja (worker) pdf.js.
 *
 * pdf.js mencipta pekerjanya sebagai modul: new Worker(url, { type: "module" }).
 * Import statik dinilai mengikut turutan, jadi lapisan keserasian dipasang DAHULU,
 * kemudian barulah pustaka pekerja pdf.js dijalankan - dengan itu Promise.try,
 * URL.parse dan Math.sumPrecise sudah wujud dalam konteks pekerja itu.
 */
import "./pdf-compat.js";
import "./pdf.worker.min.js";
