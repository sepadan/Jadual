// Verifies the new public payload builder against the real data captured from the live endpoint.
// Run: node scripts/verify-public-payload.mjs <path-to-public.json>
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHmac, randomUUID } from "node:crypto";

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
const today = process.argv[3] || new Date().toISOString().slice(0, 10);

const props = new Map([["DATABASE_ID", "live"]]);
const blob = (data) => ({ getBytes: () => data, getDataAsString: () => String(data) });
const context = vm.createContext({
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { openById: (id) => ({ id }) },
  Utilities: {
    getUuid: randomUUID,
    computeHmacSha256Signature: (text, key) => createHmac("sha256", key).update(text).digest(),
    base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
    base64Encode: (value) => Buffer.from(value.getBytes()).toString("base64"),
    base64Decode: (value) => Buffer.from(value, "base64"),
    newBlob: (data) => blob(Buffer.isBuffer(data) ? data : Buffer.from(String(data))),
    gzip: (value) => blob(gzipSync(value.getBytes())),
    ungzip: (value) => blob(gunzipSync(value.getBytes())),
    formatDate: (date, zone, format) => (format === "yyyy-MM-dd" ? today : new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(date)),
  },
});
for (const file of ["Code.gs", "Auth.gs", "Builder.gs", "Maintenance.gs"]) {
  vm.runInContext(readFileSync(new URL(`../apps-script/${file}`, import.meta.url), "utf8"), context);
}
context.output_ = (data) => data;
context.bootstrap_ = () => ({ ok: true, data: live.data });

const before = JSON.stringify(live).length;
const payload = context.publicBootstrap_();
const after = JSON.stringify(payload).length;
const cached = context.Utilities.base64Encode(context.Utilities.gzip(context.Utilities.newBlob(JSON.stringify(payload))));

console.log("today:", today);
console.log("live versions:", live.data.scheduleVersions.map((v) => `${v.id} ${v.status} ${v.effectiveDate}`).join(" | "));
console.log("payload versions:", payload.data.scheduleVersions.map((v) => `${v.id} ${v.status} ${v.effectiveDate}`).join(" | "));
console.log("payload rows:", payload.data.schedule.length, "of", live.data.schedule.length);
console.log("bytes:", before, "->", after, `(${(100 - (after / before) * 100).toFixed(1)}% smaller)`);
console.log("gzip+base64 cache entry:", cached.length, "chars (limit 95000)");
console.log("unchanged reply:", JSON.stringify({ ok: true, changed: false, revision: live.data.revision }).length, "bytes");
