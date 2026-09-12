import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const client = read("admin-api.js");
const server = read("apps-script/Code.gs");

test("the server compresses only for clients that ask", () => {
  assert.match(server, /function wantsGzip_\(source\)/, "the server cannot tell whether the client can inflate");
  assert.match(server, /GZIP_REQUEST_ = wantsGzip_\(e && e\.parameter\)/, "GET requests never ask for a compressed body");
  assert.match(server, /GZIP_REQUEST_ = wantsGzip_\(request\)/, "POST requests never ask for a compressed body");
  const at = server.indexOf("function output_(payload)");
  const output = server.slice(at, at + 900);
  assert.match(output, /if \(GZIP_REQUEST_\)/, "every payload is compressed, including the ones an old client fetches");
  assert.match(output, /Utilities\.gzip/, "the payload is sent uncompressed");
  assert.match(output, /catch \(error\)[\s\S]*createTextOutput\(json\)/, "a gzip failure leaves the client with no body at all");
});

test("the client asks for compression and inflates the answer", () => {
  assert.match(client, /const GZIP_CAPABLE = typeof DecompressionStream/, "the client never checks whether it can inflate");
  assert.match(client, /gz:GZIP_CAPABLE\?1:0/, "POST bodies carry no capability flag");
  assert.match(client, /action=public\$\{query\}\$\{GZIP_CAPABLE\?'&gz=1':''\}/, "the public payload is never compressed");
  assert.match(client, /if\(data&&data\.gz\) data=await inflatePayload\(data\.gz\)/, "a compressed body is used as if it were the payload");
});

test("a compressed body is inflated to the real payload", async () => {
  const { ApiClient } = await import("../admin-api.js");
  const payload = { ok: true, builder: { revision: 9, state: { sekolah: { nama: "SK PAYA REDAN" } } } };
  const gz = gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64");
  const answer = await new ApiClient({ apiUrl: "https://script.google.com/macros/s/x/exec" }).readResponse(
    new Response(JSON.stringify({ gz }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  assert.deepEqual(answer, payload, "the inflated body is not the payload the server sent");
});

test("an error inside a compressed body still throws", async () => {
  const { ApiClient } = await import("../admin-api.js");
  const gz = gzipSync(Buffer.from(JSON.stringify({ ok: false, error: "Sesi tamat.", code: "AUTH_REQUIRED" }), "utf8")).toString("base64");
  await assert.rejects(
    new ApiClient({ apiUrl: "https://script.google.com/macros/s/x/exec" }).readResponse(new Response(JSON.stringify({ gz }), { status: 200 })),
    (error) => error.code === "AUTH_REQUIRED",
    "an expired session inside a compressed body is not reported as an error",
  );
});
