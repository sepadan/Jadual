import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, repo), "utf8");
const html = read("index.html");
const app = read("app.js");
const version = (read("data.js").match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];

// Imports of a module, so the closure below follows the real graph instead of a hand-kept list.
function importsOf(source) {
  return [...source.matchAll(/(?:^|\n)\s*import[^;]*?from\s+["']\.\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
}

function closure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let source = "";
    try { source = read(file); } catch { continue; }
    importsOf(source).forEach((next) => queue.push(next));
  }
  return seen;
}

const reached = closure("app.js");

test("any modulepreload hint covers the whole module graph", () => {
  const hinted = [...html.matchAll(/<link rel="modulepreload" href="\.\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
  if (!hinted.length) return; // hints were measured and dropped for now; keep this guard for their return
  const missing = [...reached].filter((file) => !hinted.includes(file));
  assert.deepEqual(missing, [], `modul tanpa modulepreload: $..."...`);
  const stale = hinted.filter((file) => !reached.has(file));
  assert.deepEqual(stale, [], `modulepreload tidak lagi dalam graf: ${stale.join(", ")}`);
});

test("the script host is connected before the first call", () => {
  assert.match(html, /<link rel="preconnect" href="https:\/\/script\.google\.com" crossorigin>/);
  assert.match(html, /<link rel="dns-prefetch" href="https:\/\/script\.googleusercontent\.com">/);
});

test("the hints stay on the published version", () => {
  const stale = [...html.matchAll(/<link rel="(?:modulepreload|stylesheet)" href="\.\/[^"]+\.(?:js|css)\?v=([0-9.]+)"/g)]
    .map((m) => m[1]).filter((v) => v !== version);
  assert.deepEqual([...new Set(stale)], [], `hint pada versi lama: ${[...new Set(stale)].join(", ")} (APP_VERSION ${version})`);
});
