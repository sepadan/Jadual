/* Lapisan keserasian untuk pdf.js 6.x pada telefon lama.
 *
 * pdf.js 6.3.289 memanggil API 2025 TANPA pemeriksaan keupayaan:
 *   - Promise.try        (Safari 18.4+, Chrome 128+)   -> "undefined is not a function"
 *   - Promise.withResolvers (Safari 17.4+, Chrome 119+)
 *   - URL.parse          (Safari 18.0+, Chrome 126+)
 *   - Math.sumPrecise    (Safari 26, Chrome 137+)
 *   - Uint8Array.toBase64 / toHex (ES2025)
 * Sebab itu import PDF gagal pada iOS sebelum 18.4 walaupun failnya betul.
 *
 * Fail ini sengaja ditulis sebagai skrip biasa (tiada import/export) supaya boleh dipakai
 * DUA cara: sebagai <script> dalam halaman, dan sebagai modul pekerja (worker) melalui
 * vendor/pdf.worker.compat.js. Ia hanya menambah apa yang hilang - API asal tidak pernah
 * ditimpa.
 */
(function () {
  "use strict";
  var g = typeof globalThis !== "undefined" ? globalThis : self;

  function takAda(nama) {
    return typeof nama === "undefined" || nama === null;
  }

  /* Promise.withResolvers -> { promise, resolve, reject } */
  if (takAda(g.Promise) === false && takAda(g.Promise.withResolvers)) {
    g.Promise.withResolvers = function withResolvers() {
      var resolve, reject;
      var promise = new g.Promise(function (res, rej) {
        resolve = res;
        reject = rej;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }

  /* Promise.try(fn, ...args) -> Promise. Ralat segerak menjadi janji yang ditolak. */
  if (g.Promise && takAda(g.Promise.try)) {
    g.Promise.try = function try_(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      return new g.Promise(function (resolve) {
        resolve(fn.apply(undefined, args));
      });
    };
  }

  /* URL.parse(url, base) -> URL | null (tidak pernah membaling) */
  if (g.URL && takAda(g.URL.parse)) {
    g.URL.parse = function parse(url, base) {
      try {
        return base === undefined ? new g.URL(url) : new g.URL(url, base);
      } catch (e) {
        return null;
      }
    };
  }

  /* Math.sumPrecise(iterable) -> jumlah hampir tepat (Neumaier). */
  if (g.Math && takAda(g.Math.sumPrecise)) {
    g.Math.sumPrecise = function sumPrecise(items) {
      var jumlah = 0,
        pampasan = 0;
      var senarai = Array.isArray(items) ? items : Array.from(items);
      for (var i = 0; i < senarai.length; i++) {
        var nilai = Number(senarai[i]);
        if (Number.isNaN(nilai) || nilai === Infinity || nilai === -Infinity) return NaN;
        var t = jumlah + nilai;
        pampasan +=
          Math.abs(jumlah) >= Math.abs(nilai) ? jumlah - t + nilai : nilai - t + jumlah;
        jumlah = t;
      }
      return jumlah + pampasan;
    };
  }

  /* Uint8Array.prototype.toBase64 / toHex (ES2025). */
  if (g.Uint8Array) {
    var proto = g.Uint8Array.prototype;
    if (takAda(proto.toHex)) {
      proto.toHex = function toHex() {
        var keluar = "";
        for (var i = 0; i < this.length; i++) {
          keluar += this[i].toString(16).padStart(2, "0");
        }
        return keluar;
      };
    }
    if (takAda(proto.toBase64)) {
      var abjad = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      proto.toBase64 = function toBase64() {
        var keluar = "";
        for (var i = 0; i < this.length; i += 3) {
          var b0 = this[i],
            b1 = this[i + 1],
            b2 = this[i + 2];
          keluar += abjad[b0 >> 2];
          keluar += abjad[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
          keluar += b1 === undefined ? "=" : abjad[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
          keluar += b2 === undefined ? "=" : abjad[b2 & 63];
        }
        return keluar;
      };
    }
  }

  /* Sokongan asas lain yang turut hilang pada iOS lama. */
  if (g.Object && takAda(g.Object.hasOwn)) {
    g.Object.hasOwn = function hasOwn(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    };
  }
  if (g.Array && takAda(g.Array.prototype.at)) {
    g.Array.prototype.at = function at_(indeks) {
      var i = Math.trunc(indeks) || 0;
      if (i < 0) i += this.length;
      return i < 0 || i >= this.length ? undefined : this[i];
    };
  }
  if (g.Array && takAda(g.Array.prototype.findLast)) {
    g.Array.prototype.findLast = function findLast(fn, iniThis) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(iniThis, this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }
  if (g.Array && takAda(g.Array.prototype.findLastIndex)) {
    g.Array.prototype.findLastIndex = function findLastIndex(fn, iniThis) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(iniThis, this[i], i, this)) return i;
      }
      return -1;
    };
  }
  if (g.String && takAda(g.String.prototype.replaceAll)) {
    g.String.prototype.replaceAll = function replaceAll(cari, ganti) {
      if (cari instanceof RegExp) {
        if (!cari.global) throw new TypeError("replaceAll mesti guna regex dengan bendera global");
        return this.replace(cari, ganti);
      }
      return this.split(String(cari)).join(String(ganti));
    };
  }
  /* structuredClone: sandaran ringkas untuk data biasa sahaja (objek/tarikh/array). */
  if (takAda(g.structuredClone)) {
    g.structuredClone = function structuredClone(nilai) {
      if (nilai === null || typeof nilai !== "object") return nilai;
      if (nilai instanceof Date) return new Date(nilai.getTime());
      if (nilai instanceof RegExp) return new RegExp(nilai.source, nilai.flags);
      if (Array.isArray(nilai)) return nilai.map(g.structuredClone);
      var keluar = {};
      for (var k in nilai) {
        if (Object.prototype.hasOwnProperty.call(nilai, k)) keluar[k] = g.structuredClone(nilai[k]);
      }
      return keluar;
    };
  }
})();
