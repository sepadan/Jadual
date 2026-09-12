import test from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../admin-api.js";

const API = "https://script.google.com/macros/s/AKfycbexample/exec";

function client() {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { revision: 41 } }) };
  };
  return { api: new ApiClient({ apiUrl: API }), calls };
}

test("a visitor with no cached revision asks for the whole payload once", async () => {
  const { api, calls } = client();
  await api.publicData();
  assert.deepEqual(calls, [`${API}?action=public&gz=1`]);
});

test("a visitor who already holds a revision asks the server to confirm it", async () => {
  const { api, calls } = client();
  await api.publicData(41, "2026-09-11");
  assert.deepEqual(calls, [`${API}?action=public&revision=41&day=2026-09-11&gz=1`]);
  await api.publicData(41, "bukan-tarikh");
  assert.deepEqual(calls[1], `${API}?action=public&revision=41&gz=1`);
});

test("an unusable revision is ignored instead of sent", async () => {
  const { api, calls } = client();
  await api.publicData(0);
  await api.publicData(undefined);
  await api.publicData("abc");
  await api.publicData(-3);
  assert.deepEqual(calls, [`${API}?action=public&gz=1`, `${API}?action=public&gz=1`, `${API}?action=public&gz=1`, `${API}?action=public&gz=1`]);
});

test("an unchanged reply is not mistaken for data", async () => {
  const { api } = client();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, changed: false, revision: 41 }) });
  const reply = await api.publicData(41);
  assert.equal(reply.changed, false);
  assert.equal(reply.data, undefined);
});
