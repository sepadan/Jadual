import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHmac, randomUUID } from "node:crypto";

// Runs the real Apps Script sources with a small Google-services stand-in. The stand-in is strict
// on purpose: Utilities.base64Encode refuses a Blob, exactly as Apps Script does.
function server({ today = "2026-09-11", revision = 41 } = {}) {
  const props = new Map([["DATABASE_ID", "school-database"]]);
  const cache = new Map();
  const locks = [];
  const clock = { today };
  const propertyApi = { getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) };
  // The stand-in mirrors two real Apps Script rules: base64Encode refuses a Blob, and gzip/ungzip
  // refuse a Blob whose content type is null.
  const blob = (data, contentType) => ({ getBytes: () => data, getDataAsString: () => String(data), getContentType: () => (contentType === undefined ? null : contentType) });
  const requireContentType = (value, operation) => {
    if (value && typeof value.getContentType === "function" && value.getContentType() === null) throw new Error("Blob object must have non-null content type for this operation.");
    return value;
  };
  const context = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => propertyApi },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => locks.push("wait"), releaseLock() {} }) },
    SpreadsheetApp: { openById: (id) => ({ id }) },
    Utilities: {
      getUuid: randomUUID,
      computeHmacSha256Signature: (text, key) => createHmac("sha256", key).update(text).digest(),
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      base64Encode: (value) => {
        if (value && typeof value === "object" && typeof value.getBytes === "function") throw new TypeError("base64Encode does not accept a Blob");
        if (!Buffer.isBuffer(value) && typeof value !== "string") throw new TypeError("base64Encode expects Byte[] or String");
        return Buffer.from(value).toString("base64");
      },
      base64Decode: (value) => Buffer.from(value, "base64"),
      newBlob: (data, type, name) => blob(Buffer.isBuffer(data) ? data : Buffer.from(String(data)), type),
      gzip: (value) => blob(gzipSync(requireContentType(value, "gzip").getBytes()), "application/x-gzip"),
      ungzip: (value) => blob(gunzipSync(requireContentType(value, "ungzip").getBytes()), "application/json"),
      formatDate: (date, zone, format) => (format === "yyyy-MM-dd" ? clock.today : new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(date)),
    },
  });
  for (const file of ["Code.gs", "Auth.gs", "Builder.gs", "Maintenance.gs"]) {
    vm.runInContext(readFileSync(new URL(`../apps-script/${file}`, import.meta.url), "utf8"), context);
  }
  context.output_ = (data) => data;
  context.initializeAdmin_();
  const scriptedConfigValue = context.configValue_;
  context.configValue_ = (key) => (key === "DATA_REVISION" ? String(revision) : key === "UPDATED_AT" ? "2026-09-11T11:04:10.964Z" : scriptedConfigValue(key));
  return { context, cache, locks, props, clock, scriptedConfigValue };
}

function version(id, effectiveDate, status, createdAt) {
  return { id, label: "Jadual 14.09.2026", status, effectiveDate, createdAt };
}

function schoolFixture(versions = [version("v-rasmi", "2026-09-10", "active", "2026-09-10T14:37:12.539Z")]) {
  return {
    ok: true,
    data: {
      school: "SK Paya Redan, Muar",
      revision: 41,
      updatedAt: "2026-09-11T11:04:10.964Z",
      teachers: [{ id: "g1", name: "Guru Satu", shortName: "G1", position: "Guru Akademik", priority: 3, reliefEligible: true, active: true }],
      scheduleVersions: versions,
      schedule: versions.map((item) => ({ versionId: item.id, teacherId: "g1", day: "KHA", period: 2, startTime: "08:00", endTime: "08:30", subject: "BA", className: "3 BIJAK" })),
      absences: [{ id: "a1", date: "2026-09-10", teacherId: "g1", allDay: true, periods: [], status: "active", reason: "cuti sakit" }],
      reliefs: [
        { id: "r1", date: "2026-09-10", day: "KHA", period: 2, absentTeacherId: "g1", replacementTeacherId: "g2", status: "published", note: "dalaman" },
        { id: "r2", date: "2026-09-10", day: "KHA", period: 3, absentTeacherId: "g1", replacementTeacherId: "g2", status: "draft" },
      ],
    },
  };
}

test("the public payload carries only the timetable visitors need today", () => {
  const { context } = server();
  context.bootstrap_ = () => schoolFixture([version("v-14", "2026-09-14", "superseded", "2026-09-10T02:57:08.171Z"), version("v-rasmi", "2026-09-10", "active", "2026-09-10T14:37:12.539Z")]);
  const data = context.publicBootstrap_().data;
  assert.deepEqual(Array.from(data.scheduleVersions, (item) => item.id), ["v-rasmi"]);
  assert.deepEqual(Array.from(data.schedule, (row) => row.versionId), ["v-rasmi"]);
  assert.equal(JSON.stringify(data).includes("v-14"), false);
});

test("a superseded import never replaces the official timetable for a later date", () => {
  const { context } = server({ today: "2026-09-21" });
  context.bootstrap_ = () => schoolFixture([version("v-14", "2026-09-14", "superseded", "2026-09-10T02:57:08.171Z"), version("v-rasmi", "2026-09-10", "active", "2026-09-10T14:37:12.539Z")]);
  assert.deepEqual(Array.from(context.publicBootstrap_().data.scheduleVersions, (item) => item.id), ["v-rasmi"]);
});

test("before a new official version takes effect both versions stay available", () => {
  const { context } = server({ today: "2026-09-11" });
  context.bootstrap_ = () => schoolFixture([version("v-baru", "2026-09-14", "active", "2026-09-11T02:00:00.000Z"), version("v-lama", "2026-09-10", "superseded", "2026-09-01T02:00:00.000Z")]);
  const data = context.publicBootstrap_().data;
  assert.deepEqual(Array.from(data.scheduleVersions, (item) => item.id), ["v-lama", "v-baru"]);
  assert.deepEqual(Array.from(data.schedule, (row) => row.versionId).sort(), ["v-baru", "v-lama"]);
});

test("a visitor gets a one-line reply when they already hold the current revision", () => {
  const { context, cache } = server({ revision: 41 });
  let reads = 0;
  context.bootstrap_ = () => { reads += 1; return schoolFixture(); };
  const first = context.doGet({ parameter: { action: "public" } });
  assert.equal(first.ok, true);
  assert.equal(reads, 1);
  assert.ok(cache.has("public-payload-v1"), "the payload is cached for the day");
  const repeat = context.doGet({ parameter: { action: "public", revision: "41", day: "2026-09-11" } });
  assert.equal(repeat.changed, false);
  assert.equal(repeat.data, undefined);
  assert.equal(reads, 1);
});

test("a new calendar day invalidates the answer even when the revision is unchanged", () => {
  const { context, clock } = server({ revision: 41 });
  let reads = 0;
  context.bootstrap_ = () => { reads += 1; return schoolFixture(); };
  assert.ok(context.doGet({ parameter: { action: "public" } }).data);
  clock.today = "2026-09-14";
  const reply = context.doGet({ parameter: { action: "public", revision: "41", day: "2026-09-11" } });
  assert.ok(reply.data, "the client must receive fresh data after midnight");
  assert.equal(reads, 2);
});

test("a warm payload answers without reading a single sheet", () => {
  const { context, scriptedConfigValue } = server({ revision: 41 });
  let sheetReads = 0;
  context.bootstrap_ = () => schoolFixture();
  context.configValue_ = scriptedConfigValue;
  context.readObjects_ = (name) => { sheetReads += 1; return name === "Config" ? [{ key: "DATA_REVISION", value: "41" }, { key: "UPDATED_AT", value: "2026-09-11T11:04:10.964Z" }] : []; };
  assert.ok(context.doGet({ parameter: { action: "public" } }).data, "first visitor builds the payload");
  assert.ok(sheetReads > 0);
  sheetReads = 0;
  assert.ok(context.doGet({ parameter: { action: "public" } }).data, "next visitor is served from the cache");
  assert.equal(sheetReads, 0, "no spreadsheet read at all");
  assert.equal(context.doGet({ parameter: { action: "public", revision: "41", day: "2026-09-11" } }).changed, false);
  assert.equal(sheetReads, 0);
});

test("a write clears the cached payload so visitors never see a stale timetable", () => {
  const { context, cache } = server({ revision: 41 });
  context.bootstrap_ = () => schoolFixture();
  assert.ok(context.doGet({ parameter: { action: "public" } }).data);
  assert.ok(cache.has("public-payload-v1"));
  context.setConfig_ = () => {};
  context.audit_ = () => {};
  context.bumpRevision_();
  assert.equal(cache.has("public-payload-v1"), false);
});

test("a stale revision receives the payload and the sheets are read once per revision", () => {
  const { context } = server({ revision: 41 });
  let reads = 0;
  context.bootstrap_ = () => { reads += 1; return schoolFixture(); };
  assert.ok(context.doGet({ parameter: { action: "public", revision: "40", day: "2026-09-11" } }).data);
  assert.ok(context.doGet({ parameter: { action: "public" } }).data);
  assert.ok(context.doGet({ parameter: { action: "public" } }).data);
  assert.equal(reads, 1);
});

test("reading the public timetable never queues on the exclusive script lock", () => {
  const { context, locks } = server();
  context.bootstrap_ = () => schoolFixture();
  context.doGet({ parameter: { action: "public" } });
  context.doGet({ parameter: { action: "public", revision: "1" } });
  assert.deepEqual(locks, []);
});

test("a private action is refused before any lock or sheet read", () => {
  const { context, locks } = server();
  const reply = context.doPost({ postData: { contents: JSON.stringify({ action: "bootstrap" }) } });
  assert.equal(reply.code, "AUTH_REQUIRED");
  assert.deepEqual(locks, []);
});

test("a private action never answers from another request's cached config", () => {
  const { context } = server();
  context.readObjects_ = (name) => (name === "Config" ? [{ key: "SCHOOL_NAME", value: "Pertama" }] : []);
  assert.equal(context.configValue_("SCHOOL_NAME"), "Pertama");
  context.readObjects_ = (name) => (name === "Config" ? [{ key: "SCHOOL_NAME", value: "Kedua" }] : []);
  assert.equal(context.configValue_("SCHOOL_NAME"), "Pertama", "cached inside one request");
  context.doGet({ parameter: { action: "health" } });
  assert.equal(context.configValue_("SCHOOL_NAME"), "Kedua", "fresh again after a new request");
});

test("dates are reduced to a calendar day whatever the sheet returns", () => {
  const { context } = server();
  assert.equal(context.dayOnly_("2026-09-14"), "2026-09-14");
  assert.equal(context.dayOnly_("2026-09-14T00:00:00.000Z"), "2026-09-14");
  assert.equal(context.dayOnly_("14/09/2026"), "2026-09-14");
  assert.equal(context.dayOnly_(""), "");
  assert.equal(context.dayOnly_("bukan tarikh"), "");
});

test("a date-only time cell is stored blank instead of 00:00", () => {
  const { context } = server();
  for (const value of ["00:00", "1899-12-30", "0:00", "", null]) assert.equal(context.clockText_(value), "");
  assert.equal(context.clockText_("8:05"), "08:05");
  assert.equal(context.clockText_("07:30"), "07:30");
  const row = context.encodeRelief_({ id: "r", date: "2026-09-10", period: 2, startTime: "00:00", endTime: "1899-12-30" });
  assert.equal(row[4], "");
  assert.equal(row[5], "");
});

function maintenanceServer(reliefs) {
  const { context, locks } = server();
  const sheets = {
    Reliefs: reliefs,
    Schedule: [["versionId", "teacherId", "day", "period", "startTime", "endTime"], ...Array.from({ length: 4 }, () => ["v-rasmi", "g1", "KHA", 2, "08:00", "08:30"])],
  };
  const written = {};
  context.database_ = () => ({
    getSheetByName: (name) => {
      const values = sheets[name];
      if (!values) return null;
      return {
        getLastRow: () => values.length,
        getLastColumn: () => values[0].length,
        getRange: () => ({ getValues: () => values.map((row) => row.slice()), setValues: (next) => { written[name] = next; } }),
      };
    },
  });
  context.readObjects_ = (name) => (name === "ScheduleVersions" ? [{ id: "v-rasmi", status: "active" }] : []);
  context.audit_ = () => {};
  let bumps = 0;
  context.bumpRevision_ = () => { bumps += 1; return 42; };
  return { context, written, locks, bumps: () => bumps };
}

test("the maintenance repair rewrites only midnight rows", () => {
  const header = ["id", "date", "day", "period", "startTime", "endTime", "absentTeacherId"];
  const { context, written, bumps } = maintenanceServer([
    header,
    ["r1", "2026-09-10", "KHA", 2, "00:00", "00:00", "g1"],
    ["r2", "2026-09-11", "JUM", 2, "08:00", "08:30", "g1"],
    ["r3", "2026-09-11", "JUM", 3, "09:15", "09:45", "g1"],
  ]);
  const message = context.repairClockTimes();
  assert.match(message, /Baris relief dibaiki: 1/);
  assert.equal(written.Reliefs[0][4], "08:00");
  assert.equal(written.Reliefs[0][5], "08:30");
  assert.equal(written.Reliefs[1][4], "08:00", "already correct rows keep their clock");
  assert.equal(written.Reliefs[2][4], "09:15", "a non-standard but valid time is left alone");
  assert.equal(bumps(), 1, "the repair tells clients the data changed");
});

test("the maintenance repair does not touch a sheet that needs nothing", () => {
  const header = ["id", "date", "day", "period", "startTime", "endTime", "absentTeacherId"];
  const { context, written, bumps } = maintenanceServer([header, ["r1", "2026-09-10", "KHA", 2, "08:00", "08:30", "g1"]]);
  assert.match(context.repairClockTimes(), /Baris relief dibaiki: 0/);
  assert.equal(written.Reliefs, undefined);
  assert.equal(bumps(), 0);
});
